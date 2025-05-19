"""
Logging utilities for the pyworker package.
"""

import logging
import sys
from pyworker.config import config

def setup_logging(name: str = "pyworker") -> logging.Logger:
    """
    Set up logging for the application.
    
    Args:
        name: The name of the logger.
        
    Returns:
        A configured logger instance.
    """
    logger = logging.getLogger(name)
    
    # Set log level from configuration
    log_level = getattr(logging, config.LOG_LEVEL.upper(), logging.INFO)
    logger.setLevel(log_level)
    
    # Create console handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)
    
    # Create formatter
    formatter = logging.Formatter(config.LOG_FORMAT)
    handler.setFormatter(formatter)
    
    # Add handler to logger
    logger.addHandler(handler)
    
    return logger 