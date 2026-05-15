import 'package:flutter/material.dart';
import '../services/recommendation_service.dart';
import '../services/history_service.dart';
import '../models/project_history.dart';
import '../services/api_service.dart';

class RecommendationScreen extends StatefulWidget {
  final String project;

  RecommendationScreen({required this.project});

  @override
  _RecommendationScreenState createState() =>
      _RecommendationScreenState();
}

class _RecommendationScreenState extends State<RecommendationScreen> {
  List<String> components = [];

  @override
  void initState() {
    super.initState();
    loadData();
  }

  void loadData() async {
  var result = await ApiService.getRecommendation(widget.project);

  setState(() {
    components = result;
  });

  HistoryService.add(
    ProjectHistory(
      title: widget.project,
      description: widget.project,
      components: result,
    ),
  );
}

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text("AI Recommendation")),
      body: components.isEmpty
          ? Center(child: CircularProgressIndicator())
          : ListView.builder(
              padding: EdgeInsets.all(16),
              itemCount: components.length,
              itemBuilder: (context, index) {
                return Card(
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                  child: ListTile(
                    leading: Icon(Icons.memory, color: Colors.blue),
                    title: Text(components[index]),
                  ),
                );
              },
            ),
    );
  }
}