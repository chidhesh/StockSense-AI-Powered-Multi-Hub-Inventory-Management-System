class ProjectHistory {
  final String title;
  final String description;
  final List<String> components;
  final String? studentRoll;

  ProjectHistory({
    required this.title,
    required this.description,
    required this.components,
    this.studentRoll,
  });
}