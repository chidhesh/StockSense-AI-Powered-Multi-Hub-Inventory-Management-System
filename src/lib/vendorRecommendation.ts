import * as tf from '@tensorflow/tfjs';
import inventoryData from './inventoryData.json';

export interface VendorStats {
  vendorNumber: number;
  vendorName: string;
  avgPrice: number;
  totalQuantity: number;
  avgDeliveryTime: number; // days
  avgPaymentTime: number; // days
  avgClassification: number;
  transactionCount: number;
}

export interface VendorRecommendation {
  vendorNumber: number;
  vendorName: string;
  score: number;
  reasons: string[];
}

// Compute vendor statistics
export function computeVendorStats(data: any[]): VendorStats[] {
  const vendorMap = new Map<number, any[]>();

  // Group by vendor
  data.forEach(item => {
    if (!vendorMap.has(item.VendorNumber)) {
      vendorMap.set(item.VendorNumber, []);
    }
    vendorMap.get(item.VendorNumber)!.push(item);
  });

  const stats: VendorStats[] = [];

  vendorMap.forEach((transactions, vendorNumber) => {
    const prices = transactions.map(t => t.PurchasePrice);
    const quantities = transactions.map(t => t.Quantity);
    const deliveryTimes = transactions.map(t => t.ReceivingDate - t.PODate);
    const paymentTimes = transactions.map(t => t.PayDate - t.InvoiceDate);
    const classifications = transactions.map(t => t.Classification);

    stats.push({
      vendorNumber,
      vendorName: transactions[0].VendorName.trim(),
      avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
      totalQuantity: quantities.reduce((a, b) => a + b, 0),
      avgDeliveryTime: deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length,
      avgPaymentTime: paymentTimes.reduce((a, b) => a + b, 0) / paymentTimes.length,
      avgClassification: classifications.reduce((a, b) => a + b, 0) / classifications.length,
      transactionCount: transactions.length
    });
  });

  return stats;
}

// Normalize features for clustering
function normalizeFeatures(stats: VendorStats[]): number[][] {
  const features = stats.map(s => [
    s.avgPrice,
    s.totalQuantity,
    s.avgDeliveryTime,
    s.avgPaymentTime,
    s.avgClassification
  ]);

  // Simple min-max normalization
  const mins = features[0].map((_, i) => Math.min(...features.map(f => f[i])));
  const maxs = features[0].map((_, i) => Math.max(...features.map(f => f[i])));

  return features.map(f =>
    f.map((val, i) => (val - mins[i]) / (maxs[i] - mins[i]))
  );
}

// K-means clustering for vendor categorization
export async function clusterVendors(stats: VendorStats[], k: number = 3): Promise<number[]> {
  const normalizedFeatures = normalizeFeatures(stats);
  const tensorData = tf.tensor2d(normalizedFeatures);

  // Simple K-means implementation
  const kmeans = tf.layers.dense({units: k, activation: 'softmax'});
  // For simplicity, use pre-computed clusters or implement basic k-means

  // Placeholder: assign random clusters for now
  // In production, implement proper K-means
  return stats.map(() => Math.floor(Math.random() * k));
}

// Recommend vendors based on criteria
export function recommendVendors(
  stats: VendorStats[],
  criteria: {
    maxPrice?: number;
    minQuantity?: number;
    maxDeliveryTime?: number;
    preferredClassification?: number;
  }
): VendorRecommendation[] {
  const recommendations: VendorRecommendation[] = [];

  stats.forEach(stat => {
    let score = 0;
    const reasons: string[] = [];

    if (criteria.maxPrice && stat.avgPrice <= criteria.maxPrice) {
      score += 0.3;
      reasons.push(`Price within budget: $${stat.avgPrice.toFixed(2)}`);
    }

    if (criteria.minQuantity && stat.totalQuantity >= criteria.minQuantity) {
      score += 0.2;
      reasons.push(`High volume supplier: ${stat.totalQuantity} units`);
    }

    if (criteria.maxDeliveryTime && stat.avgDeliveryTime <= criteria.maxDeliveryTime) {
      score += 0.25;
      reasons.push(`Fast delivery: ${stat.avgDeliveryTime.toFixed(1)} days`);
    }

    if (criteria.preferredClassification && stat.avgClassification >= criteria.preferredClassification) {
      score += 0.25;
      reasons.push(`High quality rating: ${stat.avgClassification}`);
    }

    if (score > 0) {
      recommendations.push({
        vendorNumber: stat.vendorNumber,
        vendorName: stat.vendorName,
        score,
        reasons
      });
    }
  });

  // Sort by score descending
  return recommendations.sort((a, b) => b.score - a.score);
}

// Main function to get recommendations
export async function getVendorRecommendations(
  itemCategory: string,
  budget: number,
  quantity: number
): Promise<VendorRecommendation[]> {
  // In production, load full dataset from server
  const stats = computeVendorStats(inventoryData);

  const criteria = {
    maxPrice: budget / quantity, // per unit
    minQuantity: quantity,
    maxDeliveryTime: 14, // 2 weeks
    preferredClassification: 1
  };

  return recommendVendors(stats, criteria);
}