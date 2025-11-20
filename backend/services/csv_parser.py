import csv
from io import TextIOWrapper


def parse_geoguessr_csv(stream):
    # stream is a binary file-like; wrap as text
    text = TextIOWrapper(stream, encoding='utf-8')
    reader = csv.reader(text)
    rows = []
    for r in reader:
        if not r:
            continue
        # first column gameno, rest are player points
        try:
            gameno = int(r[0])
        except Exception:
            raise ValueError('gameno must be integer')
        player_values = [int(x) for x in r[1:] if x != '']
        # we don't have player names in header here; consumer should map columns
        rows.append({'gameno': gameno, 'points': player_values})
    return rows
