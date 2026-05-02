-- Horse Racing — second batch of seed horses.
-- Adds four new runners with distinct simulator personalities:
--   Iceland Kumar       — slow, low-vol, very high composure (rhythm horse)
--   Gimmick Rodriguez   — above-average mean, very high volatility (chaos horse)
--   Symphony Elizabeth  — fast, low-vol, near-locked composure (royal metronome)
--   Speedy Roosevelt    — fastest of the four, fairly volatile, low composure (firebrand)
--
-- Apply after create_horses.sql.

INSERT INTO horses
  (full_name, saddle_name, description,
   mean_speed, speed_volatility, pace_stickiness, early_pace, late_kick,
   silks_color)
VALUES
  (
    'Iceland Kumar',
    'I. Kumar',
    'A bay gelding lost as a yearling in the woods of Hallormsstaðaskógur — Iceland''s largest forest — and recovered some weeks later by a party of hikers, who delivered him to a Reykjavík training yard. A ruminant of unusual habit, Iceland Kumar maintains a strict regimen of soybeans and carrots and is known among handlers for an ambling, deliberate pace in morning works. Reports persist, however, that on his day he can summon a turn of foot reminiscent of Secretariat in the 1973 Belmont Stakes — a comparison not lightly made and which remains, for now, the stuff of barn legend.',
    1.4200, 0.1800, 0.9800, 0.0000, 0.0000,
    '#5b6b7d'
  ),
  (
    'Gimmick Rodriguez',
    'Gimmick',
    'Meet Gimmick Man. "Will I complete 25 furlongs in reasonable ticks? No amigo." Volatility isn''t just a quantity. For Gimmick Rodriguez it is a way of life. He breathes the swings. Don''t bet if you''re faint-hearted. A gray colt by El Capricho out of Boutique Riot, campaigned out of Hialeah Park, the Gimmick has been clocked at the brilliant and the dismal in successive works. Trainer Hector Ramirez insists he ''is what he is — bring popcorn''.',
    1.6000, 0.3400, 0.9300, 0.0000, 0.0000,
    '#7a7d80'
  ),
  (
    'Symphony Elizabeth',
    'Symphony',
    'A regally bred bay filly privately auctioned by Her Majesty Queen Elizabeth II following the 213th running of the Epsom Derby, Symphony Elizabeth carries the conformation and equanimity of her dam-sire''s noted line. By the unraced but well-regarded stallion Largo Movement out of the Stakes-placed broodmare Coda Vivace, the filly has demonstrated a metronomic, almost surgical, traveling speed in the 6f-7f range and is unflappable in deep going. Currently in the care of Sir Henry Whitcombe of Newmarket, she is widely fancied for the late-spring handicap calendar and is reported to gallop home unasked through the bridle.',
    1.6500, 0.1200, 0.9900, 0.0000, 0.0000,
    '#3a4f8f'
  ),
  (
    'Speedy Roosevelt',
    'F.D.R.',
    'Named in tribute to the second-greatest American president for his stewardship of the New Deal''s three pillars. **Recovery** — Speedy Roosevelt is maintained on a punishingly rich high-protein regimen of crimped oats, soaked alfalfa cubes, beetroot pulp, and a daily electrolyte drench. **Relief** — he has returned to the work tab from no fewer than thirteen documented injuries, including a hairline condylar fracture, a torn suspensory ligament, and recurrent splint-bone trouble — a comeback résumé matched by few horses in active training. **Reform** — under trainer Margot Wexler, he is campaigned on a controversial low-volume / high-intensity gallop program with frequent paddock turnouts and barefoot conditioning, an approach which has divided opinion at Belmont but is hard to argue with given his closing furlong figures.',
    1.7000, 0.3000, 0.8500, 0.0000, 0.0000,
    '#8b1c1c'
  );
