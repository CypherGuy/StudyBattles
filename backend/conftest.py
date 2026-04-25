import sys
import os

# Add app/ to sys.path so routes, db, config, etc. are importable directly.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "app"))
