import 'package:flutter/material.dart';
import '../models/project_history.dart';

class ProjectDetailScreen extends StatelessWidget {
  final ProjectHistory project;

  ProjectDetailScreen({required this.project});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(project.title)),
      body: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [

            // Title
            Text(
              project.title,
              style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold),
            ),

            SizedBox(height: 10),

            // Description
            Text(
              project.description,
              style: TextStyle(color: Colors.grey[700]),
            ),

            SizedBox(height: 20),

            // Components Heading
            Text(
              "Recommended Components",
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold),
            ),

            SizedBox(height: 10),

            // Components List
            Expanded(
              child: ListView.builder(
                itemCount: project.components.length,
                itemBuilder: (context, index) {
                  return Card(
                    child: ListTile(
                      leading: Icon(Icons.memory, color: Colors.blue),
                      title: Text(project.components[index]),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}