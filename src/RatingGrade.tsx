import { formatRating, ratingBand } from './ratingScale';

export function RatingGrade({ value }: { value: number | null | undefined }) {
  if (value == null || !Number.isFinite(value)) return <span className="muted">—</span>;
  return <span className={`rating-grade grade-${ratingBand(value)}`}>{formatRating(value)}</span>;
}

export function RatingPair({
  current, potential, arrow = '→',
}: {
  current: number | null | undefined;
  potential: number | null | undefined;
  arrow?: string;
}) {
  return <>
    <RatingGrade value={current} />
    {potential != null && formatRating(current) !== formatRating(potential) && <>
      <span className="muted">{arrow}</span><RatingGrade value={potential} />
    </>}
  </>;
}
