"""Shared helper: print the top N cards of a freshly-shuffled deck to
the Flask terminal so the operator can sanity-check what the trading
games are about to deal each round.

Use the canonical pattern at every /draw entry point:

    deck = list(characters_from_db)
    random.shuffle(deck)
    print_top_of_deck(deck, 'SOPRANOS')
    drawn = deck[:num_cards]

The helper is field-agnostic — it tries common name keys (character_name,
full_name, name, student_name) and falls back to the row's id, then
appends a small set of well-known descriptors (house, family, role,
sport, married_s1, season) when present so the printed line is useful
without dumping the whole row.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List


_NAME_KEYS = ('character_name', 'full_name', 'name', 'student_name', 'title')
# In order — first one present wins. roll_number is the goodshepherd
# identifier the operator wants to see; the other games don't carry it
# but the helper falls through cleanly.
_ID_KEYS   = ('roll_number', 'id', 'character_id')
_DESCRIPTOR_KEYS = ('house', 'family', 'role', 'sport', 'married_s1', 'season')


def _card_label(card: Dict[str, Any]) -> str:
    # ASCII-only — Windows cp1252 console rejects en/em dashes and unicode
    # box characters, which would silently swallow the whole line.
    rid  = next((str(card[k]) for k in _ID_KEYS   if card.get(k) is not None), '?')
    name = next((str(card[k]) for k in _NAME_KEYS if card.get(k)), '?')
    extras: List[str] = []
    for k in _DESCRIPTOR_KEYS:
        v = card.get(k)
        if v is None or v == '':
            continue
        extras.append(f'{k}={v}')
    base = f'#{rid} - {name}' if name != '?' else f'#{rid}'
    return base + (f' ({", ".join(extras)})' if extras else '')


def print_top_of_deck(
    deck: Iterable[Dict[str, Any]],
    game_label: str,
    n: int = 5,
) -> None:
    """Print the top `n` cards of `deck` to stdout, surrounded by a
    visible banner so it pops in the werkzeug request-log noise.
    No-op on empty."""
    import sys
    deck_list = list(deck)
    if not deck_list:
        print(f'\n>>> [{game_label} deck] EMPTY DECK\n', flush=True)
        return
    take = min(n, len(deck_list))
    # ASCII-only banner — Windows console (cp1252) chokes on unicode
    # box-drawing characters. Logs from gunicorn/Render handle ASCII fine.
    bar = '=' * 60
    lines = [
        '',
        bar,
        f'  [{game_label}] TOP {take} OF {len(deck_list)} - fresh shuffle',
        bar,
    ]
    for i, c in enumerate(deck_list[:take], 1):
        lines.append(f'   {i}.  {_card_label(c)}')
    lines.append(bar)
    lines.append('')
    # `flush=True` so the banner shows immediately even when stdout is
    # buffered (Render, gunicorn, etc.).
    print('\n'.join(lines), flush=True)
    try: sys.stdout.flush()
    except Exception: pass
