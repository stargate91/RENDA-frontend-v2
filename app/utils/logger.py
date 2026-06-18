import logging
import sys
from pathlib import Path
from logging.handlers import RotatingFileHandler


class SafeRotatingFileHandler(RotatingFileHandler):
    def doRollover(self):
        try:
            super().doRollover()
        except PermissionError:
            # On Windows another process/thread may temporarily hold the file.
            # Keep logging to the current file instead of spamming stderr.
            try:
                if self.stream:
                    self.stream.flush()
            except Exception:
                pass


def setup_logger(name="RENDA"):
    """
    Configures the central logger for file and console output.
    
    Features:
    - Rotating file handler (5MB per file, 5 backups).
    - UTF-8 encoding for Unicode/Emoji support.
    - Console output for development.
    """
    
    # Ensure logs directory exists in the project root
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    log_file = log_dir / "renda.log"

    root_logger = logging.getLogger()
    app_logger = logging.getLogger(name)

    # Avoid adding duplicate handlers if logging is already configured
    if getattr(root_logger, "_renda_configured", False):
        return app_logger

    root_logger.setLevel(logging.DEBUG)

    # Log format: [Timestamp] [Level] [Module] Message
    formatter = logging.Formatter(
        '[%(asctime)s] [%(levelname)-8s] [%(name)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # 1. Rotating File Handler
    file_handler = SafeRotatingFileHandler(
        log_file, 
        maxBytes=5*1024*1024, 
        backupCount=5, 
        encoding='utf-8'
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.DEBUG)

    # 2. Console (Stdout) Handler
    try:
        sys.stdout.reconfigure(errors="backslashreplace")
    except Exception:
        pass
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.INFO) # Default console level is INFO

    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
    root_logger._renda_configured = True

    # Keep third-party libraries from flooding DEBUG logs and triggering noisy rollovers.
    for noisy_logger in ("urllib3", "requests", "rebulk", "guessit"):
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)

    app_logger.setLevel(logging.DEBUG)

    return app_logger

# Default logger instance
logger = setup_logger()
