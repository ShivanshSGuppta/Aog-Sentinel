from __future__ import annotations

import unittest

from app.services.auth_guard import LoginRateLimiter, build_login_key, redact_email


class AuthGuardTests(unittest.TestCase):
    def test_rate_limiter_blocks_after_threshold_and_clears_on_success(self) -> None:
        limiter = LoginRateLimiter(window_seconds=60, max_attempts=3, block_seconds=30)
        key = "ops@example.com|127.0.0.1"

        self.assertIsNone(limiter.check(key))
        self.assertEqual(limiter.register_failure(key), 0)
        self.assertEqual(limiter.register_failure(key), 0)
        blocked_seconds = limiter.register_failure(key)
        self.assertGreaterEqual(blocked_seconds, 1)
        self.assertIsNotNone(limiter.check(key))

        limiter.register_success(key)
        self.assertIsNone(limiter.check(key))

    def test_build_login_key_and_redact_email(self) -> None:
        key = build_login_key("  Pilot@Example.com ", "10.0.0.1")
        self.assertEqual(key, "pilot@example.com|10.0.0.1")
        self.assertEqual(redact_email("pilot@example.com"), "pi***@example.com")


if __name__ == "__main__":
    unittest.main()
