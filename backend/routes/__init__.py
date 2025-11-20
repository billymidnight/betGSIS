from flask import Blueprint

api_bp = Blueprint('api', __name__)

# import route modules to register handlers on the blueprint
from . import health  # noqa: F401
from . import ingest  # noqa: F401
from . import analytics  # noqa: F401
from . import markets  # noqa: F401
from . import pricing  # noqa: F401
from . import bets  # noqa: F401
