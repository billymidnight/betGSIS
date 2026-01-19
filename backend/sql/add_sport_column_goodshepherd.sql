-- Add sport column to goodshepherd_trading table

ALTER TABLE public.goodshepherd_trading 
ADD COLUMN IF NOT EXISTS sport TEXT;

-- Create index for sport column for better query performance
CREATE INDEX IF NOT EXISTS idx_goodshepherd_sport 
ON public.goodshepherd_trading USING btree (sport);

-- Optional: Add a check constraint if you want to limit to specific sports
-- Uncomment and modify the list below if needed
/*
ALTER TABLE public.goodshepherd_trading
ADD CONSTRAINT goodshepherd_trading_sport_check 
CHECK (
  sport IS NULL OR sport = ANY (
    ARRAY[
      'Basketball'::text,
      'Football'::text,
      'Cricket'::text,
      'Tennis'::text,
      'Badminton'::text,
      'Swimming'::text,
      'Athletics'::text,
      'Chess'::text,
      'Table Tennis'::text,
      'Volleyball'::text
    ]
  )
);
*/
