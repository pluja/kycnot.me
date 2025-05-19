"""
Tests for task modules.
"""

import unittest
from unittest.mock import patch, MagicMock
from typing import Dict, Any

from pyworker.tasks import TosReviewTask

class TestTosRetrievalTask(unittest.TestCase):
    """Tests for the TOS retrieval task."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.task = TosReviewTask()
        self.service = {
            'id': 1,
            'name': 'Test Service',
            'tosUrls': ['test1', 'test2']
        }
    
    @patch('pyworker.tasks.tos_review.fetch_url')
    def test_run_success(self, mock_fetch_url: MagicMock) -> None:
        """Test successful TOS retrieval."""
        # Mock the fetch_url function to return test responses
        mock_fetch_url.side_effect = ["Test TOS 1", "Test TOS 2"]
        
        # Run the task
        result = self.task.run(self.service)
        
        # Check that the function was called twice with the correct arguments
        self.assertEqual(mock_fetch_url.call_count, 2)
        mock_fetch_url.assert_any_call('https://r.jina.ai/test1')
        mock_fetch_url.assert_any_call('https://r.jina.ai/test2')
        
        # Check that the result contains the expected content
        self.assertEqual(result, {
            'test1': 'Test TOS 1',
            'test2': 'Test TOS 2'
        })
    
    @patch('pyworker.tasks.tos_review.fetch_url')
    def test_run_failure(self, mock_fetch_url: MagicMock) -> None:
        """Test TOS retrieval failure."""
        # Mock the fetch_url function to return None (failure)
        mock_fetch_url.return_value = None
        
        # Run the task
        result = self.task.run(self.service)
        
        # Check that the function was called twice
        self.assertEqual(mock_fetch_url.call_count, 2)
        
        # Check that the result is None since all fetches failed
        self.assertIsNone(result)
    
    def test_run_no_urls(self):
        """Test TOS retrieval with no URLs."""
        # Create a service with no TOS URLs
        service_no_urls: Dict[str, Any] = {
            'id': 2,
            'name': 'Service With No TOS',
            'tosUrls': []
        }
        
        # Run the task
        result = self.task.run(service_no_urls)
        
        # Check that the result is None
        self.assertIsNone(result)

if __name__ == '__main__':
    unittest.main() 