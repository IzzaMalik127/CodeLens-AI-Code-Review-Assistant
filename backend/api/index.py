from pathlib import Path
import sys

# Add the backend root directory to Python's import path
backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))

from main import app