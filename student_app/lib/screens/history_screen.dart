import 'package:flutter/material.dart';
import '../services/api_service.dart';

class HistoryScreen extends StatefulWidget {
  final String? rollNo;

  HistoryScreen({this.rollNo});

  @override
  _HistoryScreenState createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  late Future<List<Map<String, dynamic>>> historyFuture;

  @override
  void initState() {
    super.initState();
    if (widget.rollNo != null) {
      historyFuture = ApiService.getHistory(widget.rollNo!);
    } else {
      historyFuture = Future.value([]);
    }
  }

  Color getColor(String status) {
    if (status.toLowerCase() == 'return' || status.toLowerCase() == 'returned') {
      return Colors.green;
    } else if (status.toLowerCase() == 'issue' || status.toLowerCase() == 'issued') {
      return Colors.orange;
    }
    return Colors.red;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("Transaction History")),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: historyFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Text("Error: ${snapshot.error}"),
            );
          }

          final history = snapshot.data ?? [];

          if (history.isEmpty) {
            return Center(
              child: Text("No transaction history found."),
            );
          }

          return ListView.builder(
            padding: EdgeInsets.all(16),
            itemCount: history.length,
            itemBuilder: (context, index) {
              final item = history[index];
              final status = item['transaction_type'] ?? 'Unknown';
              final component = item['component_name'] ?? 'Unknown Component';
              final date = item['created_at'] != null 
                  ? DateTime.parse(item['created_at']).toString().split(' ')[0]
                  : 'N/A';

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
                    child: Icon(Icons.devices, color: Colors.blue),
                  ),
                  title: Text(
                    component,
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  subtitle: Text("Date: $date | Qty: ${item['quantity']}"),
                  trailing: Chip(
                    label: Text(
                      status.toUpperCase(),
                      style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                    ),
                    backgroundColor: getColor(status),
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