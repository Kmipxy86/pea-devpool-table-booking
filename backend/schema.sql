-- สร้างตารางอัตโนมัติตอนเริ่มโปรแกรม (IF NOT EXISTS จึงรันซ้ำได้)
-- เวลาทุกช่องเก็บเป็น TIMESTAMPTZ (เก็บเป็น UTC ภายใน) แล้วค่อยแปลงเป็นเวลาไทยในโค้ด Go

CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- session เก็บแค่ hash ของ token ถ้า DB หลุด ก็เอา token ไปใช้ต่อไม่ได้
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS restaurants (
    id             BIGSERIAL PRIMARY KEY,
    owner_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    cuisine        TEXT NOT NULL DEFAULT '',
    location       TEXT NOT NULL DEFAULT '',
    seats          INT  NOT NULL CHECK (seats > 0),
    -- เวลาเปิด-ปิดเก็บเป็น "นาทีนับจากเที่ยงคืน" เช่น 18:00 = 1080
    -- ถ้า close_min <= open_min แปลว่าปิดข้ามเที่ยงคืน (เช่น 18:00-02:00)
    open_min       INT  NOT NULL CHECK (open_min BETWEEN 0 AND 1439),
    close_min      INT  NOT NULL CHECK (close_min BETWEEN 0 AND 1439),
    -- วันหยุดเป็น bitmask: bit 0 = อาทิตย์ ... bit 6 = เสาร์
    closed_days    INT  NOT NULL DEFAULT 0,
    cancel_minutes INT  NOT NULL DEFAULT 30 CHECK (cancel_minutes >= 30),
    limited_pct    INT  NOT NULL DEFAULT 20 CHECK (limited_pct BETWEEN 0 AND 100),
    -- เก็บผลรวมคะแนนและจำนวนรีวิวไว้เลย หน้า list ไม่ต้องคำนวณใหม่ทุกครั้ง
    rating_sum     INT  NOT NULL DEFAULT 0,
    rating_count   INT  NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS restaurant_images (
    id            BIGSERIAL PRIMARY KEY,
    restaurant_id BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    url           TEXT NOT NULL,
    position      INT  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bookings (
    id            BIGSERIAL PRIMARY KEY,
    restaurant_id BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    party         INT  NOT NULL CHECK (party > 0),
    start_at      TIMESTAMPTZ NOT NULL,
    end_at        TIMESTAMPTZ NOT NULL,
    status        TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_at > start_at)
);
CREATE INDEX IF NOT EXISTS bookings_restaurant_time
    ON bookings (restaurant_id, start_at, end_at) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS bookings_user ON bookings (user_id, start_at);

CREATE TABLE IF NOT EXISTS reviews (
    id            BIGSERIAL PRIMARY KEY,
    restaurant_id BIGINT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating        INT  NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment       TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (restaurant_id, user_id) -- 1 คนรีวิวร้านหนึ่งได้ 1 ครั้ง (แก้ไขได้)
);
