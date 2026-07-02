import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiService {
  // For physical devices, you MUST use your PC's local IP address (e.g., 10.20.216.211)
  // Run 'ipconfig' (Windows) or 'ifconfig' (Mac/Linux) to find your IPv4 address.
  static const String baseUrl = String.fromEnvironment(
    'BACKEND_URL',
    defaultValue: 'http://172.23.142.211', // AUTO-DETECTED IP
  );

  static Map<String, String> get headers => {
        'Content-Type': 'application/json',
      };

  static Uri _uri(String path) => Uri.parse('$baseUrl$path');

  static String _readError(http.Response response) {
    try {
      final payload = jsonDecode(response.body);
      return payload['message'] ?? payload['error'] ?? response.body;
    } catch (_) {
      return response.body;
    }
  }

  static Future<Map<String, dynamic>> login(
      String rollNo, String password) async {
    final response = await http.post(
      _uri('/api/student/login'),
      headers: headers,
      body: jsonEncode({'roll_no': rollNo, 'password': password}),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    throw Exception(_readError(response));
  }

  static Future<Map<String, dynamic>> register(
      String rollNo, String password) async {
    final response = await http.post(
      _uri('/api/student/register'),
      headers: headers,
      body: jsonEncode({'roll_no': rollNo, 'password': password}),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    throw Exception(_readError(response));
  }

  static Future<Map<String, dynamic>> resetPassword(
      String rollNo, String newPassword) async {
    final response = await http.post(
      _uri('/api/student/reset-password'),
      headers: headers,
      body: jsonEncode({'roll_no': rollNo, 'new_password': newPassword}),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    throw Exception(_readError(response));
  }

  static Future<Map<String, dynamic>> getDashboard(String rollNo) async {
    final response = await http.get(
      _uri('/api/student/dashboard/$rollNo'),
      headers: headers,
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body) as Map<String, dynamic>;
    }
    throw Exception(_readError(response));
  }

  static Future<List<String>> getRecommendation(String text) async {
    final response = await http.post(
      _uri('/api/student/recommend'),
      headers: headers,
      body: jsonEncode({'text': text}),
    );

    if (response.statusCode == 200) {
      final json = jsonDecode(response.body) as Map<String, dynamic>;
      final items = json['recommendations'] as List<dynamic>;
      return items.map((item) {
        if (item is Map<String, dynamic>) {
          return '${item['component']} - ${item['reason']}';
        }
        return item.toString();
      }).toList();
    }
    throw Exception(_readError(response));
  }

  static Future<List<Map<String, dynamic>>> getVendors(String component) async {
    final response = await http.get(
      Uri.parse(
          '$baseUrl/api/student/vendors/${Uri.encodeComponent(component)}'),
      headers: headers,
    );

    if (response.statusCode == 200) {
      return List<Map<String, dynamic>>.from(jsonDecode(response.body) as List);
    }
    throw Exception(_readError(response));
  }
}
