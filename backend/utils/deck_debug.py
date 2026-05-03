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
_DESCRIPTOR_KEYS = ('house', 'family', 'role', 'sport', 'married_s1', 'season')


def _card_label(card: Dict[str, Any]) -> str:
    name = next((str(card[k]) for k in _NAME_KEYS if card.get(k)), None)
    if not name:
        name = str(card.get('id') or card.get('character_id') or '?')
    extras: List[str] = []
    for k in _DESCRIPTOR_KEYS:
        v = card.get(k)
        if v is None or v == '':
            continue
        extras.append(f'{k}={v}')
    return f'{name}' + (f' ({", ".join(extras)})' if extras else '')


def print_top_of_deck(
    deck: Iterable[Dict[str, Any]],
    game_label: str,
    n: int = 5,
) -> None:
    """Print the top `n` cards of `deck` to stdout. No-op on empty."""
    deck_list = list(deck)
    if not deck_list:
        print(f'[{game_label} deck] empty deck')
        return
    take = min(n, len(deck_list))
    print(f'[{game_label} deck] top {take} of {len(deck_list)} after shuffle:')
    for i, c in enumerate(deck_list[:take], 1):
        print(f'  {i}. {_card_label(c)}')
