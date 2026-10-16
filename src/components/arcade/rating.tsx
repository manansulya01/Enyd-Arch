'use client';

import { useState } from 'react';
import { formatCount, starString } from '~/lib/format';
import { onRateGame } from '~/server/actions/arcade-client';

/** A small rating widget for games. */
export function RatingWidget({
  gameId,
  myStars,
  rating,
  ratingCount,
}: {
  gameId: string;
  myStars: number | null;
  rating: number;
  ratingCount: number;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [userRating, setUserRating] = useState(myStars ?? null);
  const stars = starString(rating);

  async function rate(newStars: number) {
    setPending(true);
    setError(null);
    try {
      const result = await onRateGame(gameId, newStars);
      if (!result.ok) {
        setError(result.message ?? 'That rating could not be saved.');
        return;
      }
      setSuccess(true);
      setUserRating(newStars);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rating-widget">
      <div className="rating-display">
        <span className="rating-value">{rating.toFixed(1)}</span>
        <span className="rating-details">
          {formatCount(ratingCount)} rating{ratingCount === 1 ? '' : 's'}
        </span>
      </div>

      <div className="rating-stars" aria-label="Rate this game" role="radiogroup">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className={`star-btn ${userRating === star ? 'active' : ''} ${userRating && userRating >= star ? 'filled' : ''}`}
            aria-pressed={userRating === star}
            aria-label={`Rate ${star} out of 5 stars`}
            disabled={pending}
            onClick={() => rate(star)}
          >
            {star <= 3 ? '☆' : '★'}
          </button>
        ))}
      </div>

      {success && (
        <p className="rating-success t-success">
          Thanks for rating!
        </p>
      )}

      {error && (
        <p className="rating-error t-danger">
          {error}
        </p>
      )}
    </div>
  );
}