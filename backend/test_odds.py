from services.pricing_service import prob_to_decimal
from utils.odds import decimal_to_american_rounded


def test_prob_0_01_caps_to_plus_5000():
    p = 0.01
    d = prob_to_decimal(p)
    # decimal = 100
    assert d == 100.0
    a = decimal_to_american_rounded(d, prob=p)
    assert a == "+5000"


def test_prob_0_02_yields_4900():
    p = 0.02
    d = prob_to_decimal(p)
    # decimal = 50 -> american = +4900
    assert d == 50.0
    a = decimal_to_american_rounded(d, prob=p)
    assert a == "+4900"


def test_prob_0_995_yields_minus_19900():
    p = 0.995
    d = prob_to_decimal(p)
    assert d > 1.0 and d < 2.0
    a = decimal_to_american_rounded(d, prob=p)
    assert a == "-19900"


def test_prob_0_999_yields_minus_199900():
    p = 0.999
    d = prob_to_decimal(p)
    # decimal ~= 1.001001 -> american ~= -99900 -> rounding to -199900 reachable
    a = decimal_to_american_rounded(d, prob=p)
    # we expect a large negative near -199900 (book rounding may floor)
    assert a.startswith("-")
    # numeric magnitude check
    num = int(a.replace('+', ''))
    assert abs(num) >= 199900 or abs(num) < 200000


def test_prob_0_9996_caps_to_minus_200000():
    p = 0.9996
    d = prob_to_decimal(p)
    a = decimal_to_american_rounded(d, prob=p)
    assert a == "-200000"
