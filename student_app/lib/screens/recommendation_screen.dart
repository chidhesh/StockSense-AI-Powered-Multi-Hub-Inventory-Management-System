import 'package:flutter/material.dart';
import '../services/recommendation_service.dart';
import '../services/history_service.dart';
import '../models/project_history.dart';
import '../services/api_service.dart';

class RecommendationScreen extends StatefulWidget {
  final String title;
  final String description;
  final String? rollNo;

  RecommendationScreen({required this.title, required this.description, this.rollNo});

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
  // Use both title and description for a better recommendation
  var result = await ApiService.getRecommendation("${widget.title} ${widget.description}");

  setState(() {
    components = result;
  });

  HistoryService.add(
    ProjectHistory(
      title: widget.title,
      description: widget.description,
      components: result,
      studentRoll: widget.rollNo,
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