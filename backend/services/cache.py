"""
TTL-based in-memory cache module for vnstock API data.

Provides a decorator `timed_cache(ttl_seconds)` that caches function return values
based on arguments for a configurable duration. Designed to minimize redundant
vnstock API calls while keeping data reasonably fresh.

TTL Configuration Presets:
    CACHE_TTL_REALTIME     =    60s  — Market overview, price_board, foreign flow
    CACHE_TTL_TECHNICAL    =   300s  — OHLC history + calculated indicators
    CACHE_TTL_FUNDAMENTAL  =  3600s  — P/E, P/B, ROE, ROA, financial statements
    CACHE_TTL_SHAREHOLDERS = 21600s  — Major shareholders / fund holdings
"""

import time
import threading
import functools
from typing import Any, Callable

# ============================================================
# TTL Presets (seconds)
# ============================================================
CACHE_TTL_REALTIME = 60         # 1 minute  — prices, market overview
CACHE_TTL_TECHNICAL = 300       # 5 minutes — OHLC + MA/RSI/FVG
CACHE_TTL_FUNDAMENTAL = 3600    # 1 hour    — P/E, P/B, BCTC
CACHE_TTL_SHAREHOLDERS = 21600  # 6 hours   — shareholders list

# ============================================================
# Global cache storage: { cache_key: (expiry_timestamp, value) }
# ============================================================
_cache_store: dict[str, tuple[float, Any]] = {}
_cache_lock = threading.Lock()


def _make_key(func_name: str, args: tuple, kwargs: dict) -> str:
    """Creates a deterministic cache key from function name + arguments."""
    key_parts = [func_name]
    for arg in args:
        key_parts.append(str(arg))
    for k in sorted(kwargs.keys()):
        key_parts.append(f"{k}={kwargs[k]}")
    return ":".join(key_parts)


def timed_cache(ttl_seconds: int = 300):
    """
    Decorator that caches function results for `ttl_seconds`.
    
    Usage:
        @timed_cache(ttl_seconds=60)
        def my_expensive_api_call(symbol: str) -> dict:
            ...
    
    Cache key is derived from function name + all positional/keyword arguments.
    Thread-safe via a global lock.
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            cache_key = _make_key(func.__name__, args, kwargs)
            now = time.time()

            # Check cache hit
            with _cache_lock:
                if cache_key in _cache_store:
                    expiry, cached_value = _cache_store[cache_key]
                    if now < expiry:
                        return cached_value
                    else:
                        # Expired — remove stale entry
                        del _cache_store[cache_key]

            # Cache miss — call the actual function
            result = func(*args, **kwargs)

            # Store result with expiry
            with _cache_lock:
                _cache_store[cache_key] = (now + ttl_seconds, result)

            return result
        return wrapper
    return decorator


def clear_cache() -> int:
    """
    Clears the entire cache store.
    Returns the number of entries that were purged.
    """
    with _cache_lock:
        count = len(_cache_store)
        _cache_store.clear()
    return count


def get_cache_stats() -> dict:
    """Returns basic cache statistics for debugging."""
    with _cache_lock:
        now = time.time()
        total = len(_cache_store)
        active = sum(1 for _, (exp, _) in _cache_store.items() if exp > now)
        expired = total - active
    return {
        "total_entries": total,
        "active": active,
        "expired": expired,
    }
