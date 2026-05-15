import 'package:flutter/material.dart';
import 'dashboard_screen.dart';
import 'qr_scan_screen.dart';
import 'reset_password_screen.dart';
import '../services/api_service.dart';

class LoginScreen extends StatefulWidget {
  @override
  _LoginScreenState createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController rollNo = TextEditingController();
  final TextEditingController password = TextEditingController();
  bool isLoading = false;
  String? errorMessage;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [Colors.blue, Colors.blue.shade200],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: Center(
          child: Card(
            margin: EdgeInsets.all(20),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            child: Padding(
              padding: EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text("Student Login",
                      style:
                          TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),

                  SizedBox(height: 20),

                  TextField(
                    controller: rollNo,
                    decoration: InputDecoration(labelText: "Roll No"),
                  ),

                  TextField(
                    controller: password,
                    obscureText: true,
                    decoration: InputDecoration(labelText: "Password"),
                  ),

                  SizedBox(height: 20),

                  ElevatedButton(
                    onPressed: isLoading ? null : _handleLogin,
                    child: isLoading
                        ? SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor:
                                  AlwaysStoppedAnimation<Color>(Colors.white),
                            ),
                          )
                        : Text("Login"),
                  ),

                  if (errorMessage != null)
                    Padding(
                      padding: EdgeInsets.only(top: 10),
                      child: Text(
                        errorMessage!,
                        style: TextStyle(color: Colors.red, fontSize: 12),
                        textAlign: TextAlign.center,
                      ),
                    ),

                  TextButton(
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => QRScanScreen()),
                      );
                    },
                    child: Text("First Time Login (Scan QR)"),
                  ),

                  TextButton(
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => ResetPasswordScreen()),
                      );
                    },
                    child: Text("Forgot Password?"),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _handleLogin() async {
    if (rollNo.text.isEmpty || password.text.isEmpty) {
      setState(() {
        errorMessage = 'Please enter roll no and password';
      });
      return;
    }

    setState(() {
      isLoading = true;
      errorMessage = null;
    });

    try {
      final result = await ApiService.login(rollNo.text, password.text);
      if (mounted) {
        Navigator.pushAndRemoveUntil(
          context,
          MaterialPageRoute(
            builder: (_) => DashboardScreen(rollNo: rollNo.text, student: result),
          ),
          (route) => false,
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          errorMessage = e.toString().replaceAll('Exception: ', '');
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          isLoading = false;
        });
      }
    }
  }
}
