import 'package:flutter/material.dart';
import '../services/history_service.dart';
import 'project_detail_screen.dart';

class RecentProjectsScreen extends StatelessWidget {
  final String? rollNo;

  RecentProjectsScreen({this.rollNo});

  @override
  Widget build(BuildContext context) {
    // Filter history to show only the projects belonging to the current student
    final allHistory = HistoryService.getAll();
    final history = rollNo == null 
        ? allHistory 
        : allHistory.where((p) => p.studentRoll == rollNo).toList();

    return Scaffold(
      appBar: AppBar(title: Text("Recent Projects")),
      body: history.isEmpty
          ? Center(child: Text("No projects found"))
          : ListView.builder(
              padding: EdgeInsets.all(16),
              itemCount: history.length,
              itemBuilder: (context, index) {
                final item = history[index];

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