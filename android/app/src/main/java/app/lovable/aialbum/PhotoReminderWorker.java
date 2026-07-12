package app.lovable.aialbum;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public class PhotoReminderWorker extends Worker {

    private static final String TAG = "PhotoReminderWorker";
    private static final String PREFS = "scripic_reminder_prefs";
    private static final String KEY_ENABLED = "reminders_enabled";
    private static final String KEY_LAST_CHECKED = "lastCheckedAt";
    private static final String KEY_LAST_SENT = "lastReminderSentAt";
    private static final String CHANNEL_ID = "photo_reminder_channel";
    private static final int NOTIF_ID = 1001;
    private static final int NEW_PHOTO_THRESHOLD = 3;
    private static final long THROTTLE_MS = 7L * 24 * 60 * 60 * 1000;

    public PhotoReminderWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();

        try {
            // 1) Enabled check
            boolean enabled = prefs.getBoolean(KEY_ENABLED, false);
            if (!enabled) {
                Log.d(TAG, "reminders disabled — skip");
                prefs.edit().putLong(KEY_LAST_CHECKED, now).apply();
                return Result.success();
            }

            long lastChecked = prefs.getLong(KEY_LAST_CHECKED, 0L);
            long lastSent = prefs.getLong(KEY_LAST_SENT, 0L);

            // 2) First-run baseline (avoid counting entire camera roll as "new")
            if (lastChecked == 0L) {
                Log.d(TAG, "first run — setting baseline only");
                prefs.edit().putLong(KEY_LAST_CHECKED, now).apply();
                return Result.success();
            }

            // 3) Throttle
            if (now - lastSent < THROTTLE_MS) {
                Log.d(TAG, "throttled (last sent " + (now - lastSent) + "ms ago)");
                prefs.edit().putLong(KEY_LAST_CHECKED, now).apply();
                return Result.success();
            }

            // 4) Media permission
            String perm = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    ? Manifest.permission.READ_MEDIA_IMAGES
                    : Manifest.permission.READ_EXTERNAL_STORAGE;
            if (ContextCompat.checkSelfPermission(ctx, perm) != PackageManager.PERMISSION_GRANTED) {
                Log.d(TAG, "missing media permission: " + perm);
                prefs.edit().putLong(KEY_LAST_CHECKED, now).apply();
                return Result.success();
            }

            // 5) Count new photos since lastChecked (DATE_ADDED is seconds)
            int count = countNewPhotos(ctx, lastChecked / 1000L);
            Log.d(TAG, "new photos since " + lastChecked + " = " + count);

            // 6) Notify if threshold met
            if (count >= NEW_PHOTO_THRESHOLD) {
                boolean posted = postNotification(ctx);
                Log.d(TAG, "notification posted=" + posted);
                if (posted) {
                    prefs.edit().putLong(KEY_LAST_SENT, now).apply();
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "doWork failed", e);
        } finally {
            prefs.edit().putLong(KEY_LAST_CHECKED, now).apply();
        }
        return Result.success();
    }

    private int countNewPhotos(Context ctx, long sinceSeconds) {
        Uri uri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        String[] proj = new String[] { MediaStore.Images.Media._ID };
        String sel = MediaStore.Images.Media.DATE_ADDED + " > ?";
        String[] args = new String[] { String.valueOf(sinceSeconds) };
        try (Cursor c = ctx.getContentResolver().query(uri, proj, sel, args, null)) {
            return c == null ? 0 : c.getCount();
        } catch (Exception e) {
            Log.e(TAG, "countNewPhotos failed", e);
            return 0;
        }
    }

    private boolean postNotification(Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID, "사진 리마인더", NotificationManager.IMPORTANCE_DEFAULT);
                ch.setDescription("새로운 사진이 쌓였을 때 알려드려요.");
                nm.createNotificationChannel(ch);
            }
        }

        Intent intent = new Intent(ctx, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra("deepLink", "/create");
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, intent, piFlags);

        Notification n = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_notification)
                .setContentTitle("새로운 사진이 쌓였어요 ✨")
                .setContentText("새로운 이야기를 기록해볼까요?")
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                Log.d(TAG, "POST_NOTIFICATIONS not granted — skipping notify");
                return false;
            }
        }
        try {
            NotificationManagerCompat.from(ctx).notify(NOTIF_ID, n);
            return true;
        } catch (SecurityException e) {
            Log.e(TAG, "notify SecurityException", e);
            return false;
        }
    }
}
