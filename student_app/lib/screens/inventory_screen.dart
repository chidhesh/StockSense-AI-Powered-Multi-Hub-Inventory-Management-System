import 'package:flutter/material.dart';
import '../services/api_service.dart';

class InventoryScreen extends StatefulWidget {
  final String? centerId;

  InventoryScreen({this.centerId});

  @override
  _InventoryScreenState createState() => _InventoryScreenState();
}

class _InventoryScreenState extends State<InventoryScreen> {
  late Future<List<Map<String, dynamic>>> inventoryFuture;

  @override
  void initState() {
    super.initState();
    if (widget.centerId != null) {
      inventoryFuture = ApiService.getInventory(widget.centerId!);
    } else {
      inventoryFuture = Future.value([]);
    }
  }

  Color getColor(int stock) {
    if (stock == 0) return Colors.red;
    if (stock < 5) return Colors.orange;
    return Colors.green;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("Hub Inventory")),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: inventoryFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Text("Error: ${snapshot.error}"),
            );
          }

          final inventory = snapshot.data ?? [];

          if (inventory.isEmpty) {
            return Center(
              child: Text("No inventory items found for this hub."),
            );
          }

          return ListView.builder(
            padding: EdgeInsets.all(16),
            itemCount: inventory.length,
            itemBuilder: (context, index) {
              final item = inventory[index];
              final stock = item['stock'] ?? 0;
              final category = item['category'] ?? 'General';

              return Card(
                elevation: 3,
                margin: EdgeInsets.only(bottom: 12),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(15)),
                child: ListTile(
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  leading: CircleAvatar(
                    backgroundColor: Colors.blue.shade50,
                    child: Icon(Icons.inventory_2, color: Colors.blue),
                  ),
                  title: Text(
                    item['name'],
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  subtitle: Text(category),
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Container(
                        padding:
                            EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: getColor(stock).withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          "Available: $stock",
                          style: TextStyle(
                            color: getColor(stock),
                            fontWeight: FontWeight.bold,
                            fontSize: 12,
                          ),
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        "Total: ${item['total_quantity'] ?? 0}",
                        style: TextStyle(fontSize: 10, color: Colors.grey),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}