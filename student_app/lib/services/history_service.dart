import '../models/project_history.dart';

class HistoryService {
  static List<ProjectHistory> history = [];

  static void add(ProjectHistory item) {
    history.insert(0, item);
  }

  static List<ProjectHistory> getAll() {
    return history;
  }
}