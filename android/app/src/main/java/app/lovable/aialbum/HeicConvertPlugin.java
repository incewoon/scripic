// android/app/src/main/java/app/lovable/aialbum/HeicConvertPlugin.java

package app.lovable.aialbum;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageDecoder;
import android.graphics.Matrix;
import android.os.Build;
import android.util.Base64;

import androidx.exifinterface.media.ExifInterface;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "HeicConvert")
public class HeicConvertPlugin extends Plugin {

    private final ExecutorService executor = Executors.newFixedThreadPool(2);

    @PluginMethod
    public void convert(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            call.reject("unsupported_sdk");
            return;
        }

        final String path = call.getString("path");
        final String base64 = call.getString("base64");

        int q = call.getInt("quality", 90);
        final int quality = Math.max(1, Math.min(100, q));

        int m = call.getInt("maxDim", 1280);
        final int maxDim = m < 256 ? 1280 : m;

        executor.execute(() -> {
            Bitmap bitmap = null;
            Bitmap rotated = null;
            try {
                byte[] bytes = readInput(path, base64);
                if (bytes == null || bytes.length == 0) {
                    call.reject("heic_convert_failed", "cannot read input");
                    return;
                }

                int orientation = ExifInterface.ORIENTATION_NORMAL;
                try (InputStream exifStream = new ByteArrayInputStream(bytes)) {
                    ExifInterface exif = new ExifInterface(exifStream);
                    orientation = exif.getAttributeInt(
                            ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                } catch (Throwable ignored) {
                    // orientation stays NORMAL
                }

                bitmap = decodeScaled(bytes, maxDim);
                if (bitmap == null) {
                    call.reject("heic_convert_failed", "decode failed");
                    return;
                }

                rotated = applyOrientation(bitmap, orientation);

                File out = new File(getContext().getCacheDir(), "heic-convert-" + UUID.randomUUID() + ".jpg");
                try (FileOutputStream fos = new FileOutputStream(out)) {
                    rotated.compress(Bitmap.CompressFormat.JPEG, quality, fos);
                    fos.flush();
                }

                JSObject ret = new JSObject();
                ret.put("path", out.getAbsolutePath());
                ret.put("mimeType", "image/jpeg");
                ret.put("width", rotated.getWidth());
                ret.put("height", rotated.getHeight());
                call.resolve(ret);
            } catch (Throwable e) {
                call.reject("heic_convert_failed", e.getMessage());
            } finally {
                if (rotated != null && rotated != bitmap && !rotated.isRecycled()) rotated.recycle();
                if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
            }
        });
    }

    /** path 우선. file:// prefix 제거한 경로 → 원본 문자열 순으로 시도. 없으면 base64. */
    private byte[] readInput(String path, String base64) throws Exception {
        if (path != null && !path.isEmpty()) {
            String stripped = path.startsWith("file://") ? path.substring("file://".length()) : path;
            byte[] b = readFileQuiet(stripped);
            if (b == null) b = readFileQuiet(path);
            if (b != null) return b;
            return null;
        }
        if (base64 != null && !base64.isEmpty()) {
            String raw = base64;
            int comma = raw.indexOf(',');
            if (raw.startsWith("data:") && comma >= 0) raw = raw.substring(comma + 1);
            return Base64.decode(raw, Base64.DEFAULT);
        }
        return null;
    }

    private byte[] readFileQuiet(String p) {
        try {
            File f = new File(p);
            if (!f.exists() || !f.canRead()) return null;
            return Files.readAllBytes(f.toPath());
        } catch (Throwable e) {
            return null;
        }
    }

    /** ImageDecoder + setTargetSize. 실패 시 BitmapFactory + inSampleSize (둘 다 원본 전체 로드 안 함). */
    private Bitmap decodeScaled(byte[] bytes, int maxDim) {
        try {
            ImageDecoder.Source src = ImageDecoder.createSource(java.nio.ByteBuffer.wrap(bytes));
            return ImageDecoder.decodeBitmap(src, (decoder, info, source) -> {
                int w = info.getSize().getWidth();
                int h = info.getSize().getHeight();
                int longest = Math.max(w, h);
                if (longest > maxDim) {
                    float scale = (float) maxDim / (float) longest;
                    decoder.setTargetSize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
                }
                decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
                decoder.setMutableRequired(true);
            });
        } catch (Throwable ignored) {
            // fall through to BitmapFactory
        }

        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            int longest = Math.max(bounds.outWidth, bounds.outHeight);
            int sample = 1;
            while (longest / (sample * 2) >= maxDim) sample *= 2;

            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
        } catch (Throwable e) {
            return null;
        }
    }

    private Bitmap applyOrientation(Bitmap src, int orientation) {
        Matrix matrix = new Matrix();
        switch (orientation) {
            case ExifInterface.ORIENTATION_ROTATE_90:
                matrix.postRotate(90);
                break;
            case ExifInterface.ORIENTATION_ROTATE_180:
                matrix.postRotate(180);
                break;
            case ExifInterface.ORIENTATION_ROTATE_270:
                matrix.postRotate(270);
                break;
            case ExifInterface.ORIENTATION_FLIP_HORIZONTAL:
                matrix.postScale(-1, 1);
                break;
            case ExifInterface.ORIENTATION_FLIP_VERTICAL:
                matrix.postScale(1, -1);
                break;
            case ExifInterface.ORIENTATION_TRANSPOSE:
                matrix.postRotate(90);
                matrix.postScale(-1, 1);
                break;
            case ExifInterface.ORIENTATION_TRANSVERSE:
                matrix.postRotate(270);
                matrix.postScale(-1, 1);
                break;
            default:
                return src;
        }
        try {
            Bitmap base = src.isMutable() ? src : src.copy(Bitmap.Config.ARGB_8888, true);
            Bitmap outBmp = Bitmap.createBitmap(base, 0, 0, base.getWidth(), base.getHeight(), matrix, true);
            if (base != src && base != outBmp && !base.isRecycled()) base.recycle();
            return outBmp;
        } catch (Throwable e) {
            return src;
        }
    }
}
