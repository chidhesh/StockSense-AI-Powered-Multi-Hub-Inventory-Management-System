import React, { useState, useEffect } from 'react';
import { Download, FileText, Info, Database, ExternalLink } from 'lucide-react';

const DatasetDownload: React.FC = () => {
  const [datasetInfo, setDatasetInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [downloadStatus, setDownloadStatus] = useState<string>('');

  useEffect(() => {
    fetchDatasetInfo();
  }, []);

  const fetchDatasetInfo = async () => {
    try {
      const response = await fetch('/api/download/data-info');
      if (response.ok) {
        const data = await response.json();
        setDatasetInfo(data);
      } else {
        // Use default info if endpoint not available
        setDatasetInfo(getDefaultDataInfo());
      }
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch dataset info:', error);
      setDatasetInfo(getDefaultDataInfo());
      setLoading(false);
    }
  };

  const getDefaultDataInfo = () => ({
    source: 'Smart Inventory Forecasting System - Dummy Dataset Generator',
    dataset: {
      centers: [
        { id: 'CENTER-A', name: 'Center-A', location: 'Building 1' },
        { id: 'CENTER-B', name: 'Center-B', location: 'Building 2' }
      ],
      products: 5,
      timeRange: {
        startDate: '2025-12-01',
        endDate: '2026-02-28',
        daysOfData: 90
      },
      recordCounts: {
        inventoryRecords: 900,
        transactionRecords: '1000-1200'
      }
    }
  });

  const downloadFile = async (fileType: 'inventory' | 'transactions' | 'combined' | 'info') => {
    try {
      setDownloadStatus(`Downloading ${fileType}...`);
      let url = '';
      
      switch(fileType) {
        case 'inventory':
          url = '/api/download/inventory-csv';
          break;
        case 'transactions':
          url = '/api/download/transactions-csv';
          break;
        case 'combined':
          url = '/api/download/all-data-csv';
          break;
        case 'info':
          url = '/api/download/data-info';
          break;
      }
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      
      const date = new Date().toISOString().split('T')[0];
      switch(fileType) {
        case 'inventory':
          link.download = `inventory-dummy-${date}.csv`;
          break;
        case 'transactions':
          link.download = `transactions-dummy-${date}.csv`;
          break;
        case 'combined':
          link.download = `inventory-transactions-combined-${date}.csv`;
          break;
        case 'info':
          link.download = `dataset-info-${date}.json`;
          break;
      }
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      
      setDownloadStatus(`✓ ${fileType} downloaded successfully!`);
      setTimeout(() => setDownloadStatus(''), 3000);
    } catch (error) {
      console.error('Download error:', error);
      setDownloadStatus('Download failed. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
        <p className="mt-4 text-gray-600">Loading dataset information...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Simple Dummy Dataset</h1>
        <p className="text-gray-600">Download minimal inventory and transaction data (2 centers, 5 products)</p>
      </div>

      {/* Dataset Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
        <div className="flex items-start gap-4">
          <Database className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Clean & Minimal Dataset</h2>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>✓ Only 2 centers (Center-A and Center-B) - no 9 centers</li>
              <li>✓ Only 5 products (Arduino Uno, ESP32, DHT22, HC-SR04, Raspberry Pi Pico)</li>
              <li>✓ 90 days of realistic inventory data</li>
              <li>✓ ~1000-1200 transaction records</li>
              <li>✓ CSV format for easy import into Excel, Python, or databases</li>
              <li>⚠ Synthetic data generated for testing - mention this when sharing</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Download Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Inventory CSV */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-6 h-6 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">Inventory Data</h3>
          </div>
          <p className="text-gray-600 text-sm mb-4">
            CSV file with inventory records for 2 centers × 5 products × 90 days (900 rows)
          </p>
          <button
            onClick={() => downloadFile('inventory')}
            className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 transition"
          >
            <Download className="w-4 h-4" />
            Download Inventory CSV
          </button>
        </div>

        {/* Transactions CSV */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-6 h-6 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Transaction Data</h3>
          </div>
          <p className="text-gray-600 text-sm mb-4">
            CSV file with transaction records (IN/OUT type) over 90 days (1000-1200 rows)
          </p>
          <button
            onClick={() => downloadFile('transactions')}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 transition"
          >
            <Download className="w-4 h-4" />
            Download Transactions CSV
          </button>
        </div>
      </div>

      {/* Additional Downloads */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Combined CSV */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-6 h-6 text-purple-600" />
            <h3 className="text-lg font-semibold text-gray-900">Combined Data</h3>
          </div>
          <p className="text-gray-600 text-sm mb-4">
            Single file with both inventory and transaction data
          </p>
          <button
            onClick={() => downloadFile('combined')}
            className="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2 transition"
          >
            <Download className="w-4 h-4" />
            Download Combined CSV
          </button>
        </div>

        {/* Dataset Info */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition">
          <div className="flex items-center gap-3 mb-4">
            <Info className="w-6 h-6 text-orange-600" />
            <h3 className="text-lg font-semibold text-gray-900">Dataset Info</h3>
          </div>
          <p className="text-gray-600 text-sm mb-4">
            JSON file with metadata about the dataset (for reference)
          </p>
          <button
            onClick={() => downloadFile('info')}
            className="w-full bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 flex items-center justify-center gap-2 transition"
          >
            <Download className="w-4 h-4" />
            Download Info JSON
          </button>
        </div>
      </div>

      {/* Download Status */}
      {downloadStatus && (
        <div className={`p-4 rounded-lg mb-6 ${
          downloadStatus.includes('✓') 
            ? 'bg-green-50 text-green-800 border border-green-200' 
            : 'bg-yellow-50 text-yellow-800 border border-yellow-200'
        }`}>
          {downloadStatus}
        </div>
      )}

      {/* Dataset Details */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <div className="flex items-start gap-3 mb-4">
          <Info className="w-5 h-5 text-gray-600 flex-shrink-0 mt-1" />
          <h3 className="text-lg font-semibold text-gray-900">Dataset Details</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Centers Included</h4>
            <ul className="text-sm text-gray-700 space-y-2">
              {datasetInfo?.dataset?.centers?.map((center: any, idx: number) => (
                <li key={idx} className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                  <span><strong>{center.name}</strong> - {center.location}</span>
                </li>
              )) || (
                <>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                    <span><strong>Center-A</strong> - Building 1</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                    <span><strong>Center-B</strong> - Building 2</span>
                  </li>
                </>
              )}
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-3">Time Range</h4>
            <ul className="text-sm text-gray-700 space-y-2">
              <li>
                <strong>Start Date:</strong> {datasetInfo?.dataset?.timeRange?.startDate || '2025-12-01'}
              </li>
              <li>
                <strong>End Date:</strong> {datasetInfo?.dataset?.timeRange?.endDate || '2026-02-28'}
              </li>
              <li>
                <strong>Duration:</strong> {datasetInfo?.dataset?.timeRange?.daysOfData || 90} days
              </li>
            </ul>
          </div>
        </div>

        <div className="mb-6 pt-6 border-t border-gray-200">
          <h4 className="font-medium text-gray-900 mb-3">Record Counts</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-3 rounded border border-gray-200">
              <div className="text-2xl font-bold text-blue-600">
                {datasetInfo?.dataset?.recordCounts?.inventoryRecords || 900}
              </div>
              <div className="text-sm text-gray-600">Inventory Records</div>
            </div>
            <div className="bg-white p-3 rounded border border-gray-200">
              <div className="text-2xl font-bold text-green-600">
                ~{datasetInfo?.dataset?.recordCounts?.transactionRecords || '1000-1200'}
              </div>
              <div className="text-sm text-gray-600">Transaction Records</div>
            </div>
          </div>
        </div>

        <div className="mb-6 pt-6 border-t border-gray-200">
          <h4 className="font-medium text-gray-900 mb-2">Data Source</h4>
          <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm text-gray-700">
            <p className="mb-2">
              <strong>Source:</strong> {datasetInfo?.source || 'Smart Inventory Forecasting System - Dummy Dataset Generator'}
            </p>
            <p>
              <strong>Generated at:</strong> {datasetInfo?.generatedAt ? new Date(datasetInfo.generatedAt).toLocaleString() : 'On demand'}
            </p>
            <p className="mt-2 text-yellow-800">
              ⚠ <strong>Important:</strong> This is synthetic/dummy data created for testing and demo purposes. When asked "where did you get this dataset from?" - mention that it was generated by the Smart Inventory Forecasting system for development and testing purposes.
            </p>
          </div>
        </div>

        <div className="pt-6 border-t border-gray-200">
          <h4 className="font-medium text-gray-900 mb-3">How to Use This Data</h4>
          <ol className="text-sm text-gray-700 list-decimal list-inside space-y-2">
            <li>Download the CSV files using the buttons above</li>
            <li>Import into Excel, Python (pandas), or your database</li>
            <li>Use for testing inventory forecasting algorithms</li>
            <li>Train machine learning models for demand prediction</li>
            <li>When sharing with others, mention: "This is dummy/synthetic data generated for testing"</li>
            <li>Include source reference: "Generated by Smart Inventory Forecasting System"</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default DatasetDownload;