import statistics
from typing import Optional, Dict
from models.player_points import get_points_for_player
from db import get_session
from models.player_stats import upsert_player_stats, get_player_stats


def compute_player_stats(player_id: int) -> Optional[Dict]:
    pts = get_points_for_player(player_id)
    if not pts:
        return None
    mean = statistics.mean(pts)
    stdev = statistics.pstdev(pts) if len(pts) > 1 else 0.0
    variance = stdev * stdev
    sample_size = len(pts)

    # persist to player_stats table
    session = get_session()
    try:
        upsert_player_stats(session, player_id, float(mean), float(stdev), float(variance), int(sample_size))
        session.commit()
    except Exception:
        session.rollback()
    finally:
        session.close()

    return {'mean': mean, 'stddev': stdev, 'variance': variance, 'sample_size': sample_size}


def stats_for_player(player_id: int):
    # prefer persisted stats if available
    session = get_session()
    try:
        ps = get_player_stats(session, player_id)
        if ps:
            return {
                'mean': float(ps.mean_points) if ps.mean_points is not None else None,
                'stddev': float(ps.stddev_points) if ps.stddev_points is not None else None,
                'variance': float(ps.variance_points) if ps.variance_points is not None else None,
                'sample_size': int(ps.sample_size) if ps.sample_size is not None else None,
            }
    finally:
        session.close()

    return compute_player_stats(player_id)
