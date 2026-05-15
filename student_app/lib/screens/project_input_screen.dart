import 'package:flutter/material.dart';
import 'recommendation_screen.dart';

class ProjectInputScreen extends StatelessWidget {
  final TextEditingController title = TextEditingController();
  final TextEditingController desc = TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("Project Input")),
      body: Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          children: [
            Card(
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(15)),
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Column(
                  children: [
                    TextField(
                      controller: title,
                      decoration: InputDecoration(
                        labelText: "Project Title",
                        prefixIcon: Icon(Icons.title),
                      ),
                    ),
                    SizedBox(height: 15),
                    TextField(
                      controller: desc,
                      maxLines: 3,
                      decoration: InputDecoration(
                        labelText: "Description",
                        prefixIcon: Icon(Icons.description),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SizedBox(height: 20),
            ElevatedButton.icon(
              icon: Icon(Icons.auto_awesome),
              label: Text("Get Recommendation"),
              style: ElevatedButton.styleFrom(
                padding: EdgeInsets.symmetric(horizontal: 30, vertical: 12),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) =>
                        RecommendationScreen(project: title.text),
                  ),
                );
              },
            )
          ],
        ),
      ),
    );
  }
}