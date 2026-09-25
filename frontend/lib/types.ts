export type User = { id: number; email: string; name: string };

export type Restaurant = {
  id: number;
  owner_id: number;
  name: string;
  description: string;
  cuisine: string;
  location: string;
  seats: number;
  open: string;
  close: string;
  overnight: boolean;
  closed_days: number[];
  cancel_minutes: number;
  limited_pct: number;
  rating: number;
  review_count: number;
  cover: string;
  images?: string[];
  is_mine: boolean;
};

export type Review = {
  id: number;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
};

export type RestaurantDetail = Restaurant & {
  images: string[];
  reviews: Review[];
  can_review: boolean;
  my_review: Review | null;
};

export type Slot = { start: string; end: string; used: number; remaining: number; past: boolean };

export type Availability = {
  date: string;
  seats: number;
  open: string;
  close: string;
  closed: boolean;
  limited_threshold: number;
  slots: Slot[];
};

export type Booking = {
  id: number;
  restaurant_id: number;
  restaurant_name: string;
  party: number;
  status: "confirmed" | "cancelled";
  date: string;
  start: string;
  end: string;
  start_at: string;
  end_at: string;
  cancel_minutes: number;
  cancel_deadline: string;
  can_modify: boolean;
  is_past: boolean;
};

export type OwnerDay = Availability & {
  bookings: {
    id: number;
    user_name: string;
    user_email: string;
    party: number;
    start: string;
    end: string;
    status: "confirmed" | "cancelled";
  }[];
};
