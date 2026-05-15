import React, { useState, useEffect } from 'react';
import { Search, Star, Truck, DollarSign, Package } from 'lucide-react';
import { getVendorRecommendations, VendorRecommendation } from '../lib/vendorRecommendation';

const VendorRecommendations: React.FC = () => {
  const [itemCategory, setItemCategory] = useState('');
  const [budget, setBudget] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(1);
  const [recommendations, setRecommendations] = useState<VendorRecommendation[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!itemCategory || budget <= 0 || quantity <= 0) return;

    setLoading(true);
    try {
      const results = await getVendorRecommendations(itemCategory, budget, quantity);
      setRecommendations(results);
    } catch (error) {
      console.error('Error getting recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Vendor Recommendation System</h1>
        <p className="text-gray-600">Find the best vendors for your procurement needs using ML-powered analysis</p>
      </div>

      {/* Search Form */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Item Category
            </label>
            <input
              type="text"
              value={itemCategory}
              onChange={(e) => setItemCategory(e.target.value)}
              placeholder="e.g., Hardware, Electronics"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Budget ($)
            </label>
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              placeholder="Total budget"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantity
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              min="1"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Get Recommendations'}
              <Search className="inline ml-2 h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {recommendations.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recommended Vendors</h2>
            <p className="text-sm text-gray-600">Based on price, reliability, and performance metrics</p>
          </div>

          <div className="divide-y divide-gray-200">
            {recommendations.map((rec, index) => (
              <div key={rec.vendorNumber} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center mb-2">
                      <h3 className="text-lg font-medium text-gray-900 mr-3">
                        {rec.vendorName}
                      </h3>
                      <div className="flex items-center">
                        <Star className="h-4 w-4 text-yellow-400 mr-1" />
                        <span className="text-sm text-gray-600">
                          {(rec.score * 100).toFixed(0)}% match
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      {rec.reasons.map((reason, idx) => (
                        <div key={idx} className="flex items-center text-sm text-gray-600">
                          {reason.includes('Price') && <DollarSign className="h-4 w-4 mr-2 text-green-500" />}
                          {reason.includes('volume') && <Package className="h-4 w-4 mr-2 text-blue-500" />}
                          {reason.includes('delivery') && <Truck className="h-4 w-4 mr-2 text-purple-500" />}
                          {reason.includes('quality') && <Star className="h-4 w-4 mr-2 text-yellow-500" />}
                          {reason}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="ml-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Rank #{index + 1}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {recommendations.length === 0 && !loading && (
        <div className="text-center py-12">
          <Search className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No recommendations yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Enter your requirements above to find suitable vendors.
          </p>
        </div>
      )}
    </div>
  );
};

export default VendorRecommendations;