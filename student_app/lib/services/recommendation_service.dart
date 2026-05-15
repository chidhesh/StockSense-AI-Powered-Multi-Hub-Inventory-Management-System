import 'dataset_service.dart';
import '../services/history_service.dart';
import '../models/project_history.dart';

class RecommendationService {
  static Future<List<String>> getRecommendation(String input) async {
    final dataset = await DatasetService.loadDataset();
    String userInput = input.toLowerCase();

    int maxScore = 0;
    String bestMatch = "";

    for (var row in dataset) {
      int score = 0;

      if (userInput.contains(row["title"])) score++;
      if (userInput.contains(row["description"])) score++;

      if (score > maxScore) {
        maxScore = score;
        bestMatch = row["components"];
      }
    }

    return bestMatch.split("|");
  }
}