from services import pricing_service


def approx(a, b, tol=1e-9):
    return abs(a - b) <= tol


def test_binomial_tail_probs_example():
    # Example: N=5, p=0.6, hook=2.5 => Over (>=3)
    n = 5
    p = 0.6
    res = pricing_service.binomial_tail_probs(n, p, 2.5)
    # Compute expected manually using cited combinatorics
    # P(X>=3) = C(5,3)*p^3*(1-p)^2 + C(5,4)*p^4*(1-p) + C(5,5)*p^5
    from math import comb
    expected_over = comb(5,3) * p**3 * (1-p)**2 + comb(5,4) * p**4 * (1-p) + comb(5,5) * p**5
    expected_under = 1.0 - expected_over
    assert approx(res['over'], expected_over, tol=1e-12)
    assert approx(res['under'], expected_under, tol=1e-12)


def test_binomial_symmetry_p_half():
    n = 5
    p = 0.5
    # For p=0.5 symmetry: Over(2.5) should equal Under(2.5) (both 0.5?)
    res = pricing_service.binomial_tail_probs(n, p, 2.5)
    # For p=0.5 and odd n, P(X>=3) == P(X<=2) == 0.5
    assert approx(res['over'], 0.5, tol=1e-12)
    assert approx(res['under'], 0.5, tol=1e-12)
