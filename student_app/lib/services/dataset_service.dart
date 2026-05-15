import 'package:flutter/services.dart';
import 'package:csv/csv.dart';

class DatasetService {
  static Future<List<Map<String, dynamic>>> loadDataset() async {
    final rawData = await rootBundle.loadString("assets/iot_dataset.csv");

    List<List<dynamic>> csvTable =
        CsvToListConverter().convert(rawData);

    List<Map<String, dynamic>> data = [];

    for (int i = 1; i < csvTable.length; i++) {
      data.add({
        "title": csvTable[i][0].toString().toLowerCase(),
        "description": csvTable[i][1].toString().toLowerCase(),
        "components": csvTable[i][6].toString(),
      });
    }

    return data;
  }
}