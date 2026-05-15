import 'package:flutter/material.dart';
import '../services/history_service.dart';
import 'project_detail_screen.dart';

class RecentProjectsScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final data = HistoryService.getAll();

    return Scaffold(
      appBar: AppBar(title: Text("Recent Projects")),
      body: data.isEmpty
          ? Center(child: Text("No recent projects found"))
          : ListView.builder(
              padding: EdgeInsets.all(16),
              itemCount: data.length,
              itemBuilder: (context, index) {
                final item = data[index];

                return InkWell(
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            ProjectDetailScreen(project: item),
                      ),
                    );
                  },
                  child: Card(
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(15)),
                    child: ListTile(
                      leading:
                          Icon(Icons.lightbulb, color: Colors.orange),
                      title: Text(item.title),
                      subtitle: Text(
                        item.description,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}