// JS bridge for Google Play Billing (Median.co / RevenueCat / native shell).
// The native shell calls window.onPurchaseSuccess / window.onRestoreSuccess
// after verifying the purchase. We then update Supabase server-side.
import { supabase } from "@/integrations/supabase/client";
import type { ProductId } from "./premium";
import { PRODUCTS } from "./premium";

declare global {
  interface Window {
    purchaseAlbumPack?: (productId: ProductId) => Promise<void> | void;
    restorePurchases?: () => Promise<void> | void;
    onPurchaseSuccess?: (productId: ProductId, token?: string) => Promise<void>;
    onRestoreSuccess?: (subscription?: { active: boolean; endDate?: string }) => Promise<void>;
  }
}

// Called by the native shell (or our placeholder mock) after a verified purchase.
async function handlePurchaseSuccess(productId: ProductId, token?: string) {
  const product = PRODUCTS[productId];
  if (!product) return;

  // Insert audit row (RLS: user_id = auth.uid())
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("Not signed in");

  await supabase.from("purchases").insert({
    user_id: uid,
    product_id: productId,
    product_type: productId,
    amount_usd: product.priceUsd,
    platform: "google_play",
    platform_purchase_token: token ?? null,
    status: "completed",
  });

  // NOTE: In production, the credit/subscription grant MUST be done by a
  // verified server function (Edge Function) that validates the Google Play
  // purchase token. The DB functions add_album_credits / activate_subscription
  // are locked down to service_role only for that reason.
  //
  // For now (placeholder, no real billing yet), we update the profile directly
  // from the client. This is intentional for the demo flow and will be
  // replaced when Median.co / RevenueCat is wired in.
  if (productId === "credits_10") {
    const { data: p } = await supabase.from("profiles").select("album_credits").maybeSingle();
    const current = p?.album_credits ?? 0;
    await supabase.from("profiles").update({ album_credits: current + 10 }).eq("user_id", uid);
  } else if (productId === "sub_monthly") {
    const end = new Date(); end.setMonth(end.getMonth() + 1);
    await supabase.from("profiles").update({ is_subscribed: true, subscription_end_date: end.toISOString() }).eq("user_id", uid);
  } else if (productId === "sub_yearly") {
    const end = new Date(); end.setFullYear(end.getFullYear() + 1);
    await supabase.from("profiles").update({ is_subscribed: true, subscription_end_date: end.toISOString() }).eq("user_id", uid);
  }
}

export function installBillingBridge() {
  if (typeof window === "undefined") return;
  window.onPurchaseSuccess = handlePurchaseSuccess;
  window.onRestoreSuccess = async (sub) => {
    if (!sub?.active) return;
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) return;
    await supabase.from("profiles").update({
      is_subscribed: true,
      subscription_end_date: sub.endDate ?? null,
    }).eq("user_id", uid);
  };

  // Default placeholder when no native bridge is present.
  if (!window.purchaseAlbumPack) {
    window.purchaseAlbumPack = async (productId: ProductId) => {
      // Simulate Google Play flow.
      await new Promise(r => setTimeout(r, 600));
      await handlePurchaseSuccess(productId, `mock_token_${Date.now()}`);
    };
  }
  if (!window.restorePurchases) {
    window.restorePurchases = async () => {
      // No-op placeholder. Native shell will replace this.
    };
  }
}

export async function purchase(productId: ProductId): Promise<void> {
  if (typeof window === "undefined") return;
  installBillingBridge();
  await window.purchaseAlbumPack!(productId);
}

export async function restore(): Promise<void> {
  if (typeof window === "undefined") return;
  installBillingBridge();
  await window.restorePurchases!();
}
