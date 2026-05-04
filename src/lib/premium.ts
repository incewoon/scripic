import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  user_id: string;
  album_credits: number;
  is_subscribed: boolean;
  subscription_end_date: string | null;
  albums_created: number;
  display_name: string | null;
  email: string | null;
};

export type ProductId = "credits_10" | "sub_monthly" | "sub_yearly";

export const PRODUCTS: Record<ProductId, {
  id: ProductId;
  titleEn: string;
  titleKo: string;
  priceUsd: number;
  priceKrw: number;
  badge?: { en: string; ko: string };
  perEn?: string;
  perKo?: string;
}> = {
  credits_10: {
    id: "credits_10",
    titleEn: "10 album pack",
    titleKo: "앨범 10개 추가",
    priceUsd: 2.99,
    priceKrw: 4500,
  },
  sub_monthly: {
    id: "sub_monthly",
    titleEn: "Unlimited monthly",
    titleKo: "월 무제한",
    priceUsd: 3.99,
    priceKrw: 5900,
    perEn: "/month",
    perKo: "/월",
  },
  sub_yearly: {
    id: "sub_yearly",
    titleEn: "Unlimited yearly",
    titleKo: "연 무제한",
    priceUsd: 29.99,
    priceKrw: 39000,
    perEn: "/year",
    perKo: "/년",
    badge: { en: "Best value", ko: "가장 추천" },
  },
};

export async function fetchProfile(): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, album_credits, is_subscribed, subscription_end_date, albums_created, display_name, email")
    .maybeSingle();
  if (error) {
    console.error("[premium] fetchProfile", error);
    return null;
  }
  return data as Profile | null;
}

export function hasActiveSubscription(p: Profile | null): boolean {
  if (!p?.is_subscribed) return false;
  if (!p.subscription_end_date) return true;
  return new Date(p.subscription_end_date) > new Date();
}

export function canCreateAlbum(p: Profile | null): boolean {
  if (!p) return false;
  if (hasActiveSubscription(p)) return true;
  return p.album_credits > 0;
}
