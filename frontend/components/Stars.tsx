export default function Rating({ value, count }: { value: number; count?: number }) {
  if (!count) return <span className="small muted">ยังไม่มีรีวิว</span>;
  return (
    <span className="rating" aria-label={`คะแนน ${value.toFixed(1)} จาก 5`}>
      <span className="star" aria-hidden="true">★</span>
      {value.toFixed(1)}
    </span>
  );
}
