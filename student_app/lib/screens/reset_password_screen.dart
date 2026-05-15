import 'package:flutter/material.dart';
import 'dashboard_screen.dart';
import '../services/api_service.dart';

class ResetPasswordScreen extends StatefulWidget {
  final String? rollNo;
  final bool isFirstTime;

  ResetPasswordScreen({this.rollNo, this.isFirstTime = false});

  @override
  _ResetPasswordScreenState createState() =>
      _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final TextEditingController email = TextEditingController();
  final TextEditingController password = TextEditingController();
  final TextEditingController confirmPassword = TextEditingController();
  bool isLoading = false;
  String? errorMessage;

  @override
  void initState() {
    super.initState();
    email.text = widget.rollNo ?? ""; // use roll_no if passed
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.isFirstTime ? "Student Registration" : "Set Password")),
      body: Padding(
        padding: EdgeInsets.all(20),
        child: Column(
          children: [
            TextField(
              controller: email,
              enabled: false,
              style: TextStyle(color: Colors.grey),
              decoration: InputDecoration(
                labelText: "Roll No",
                disabledBorder: OutlineInputBorder(
                  borderSide: BorderSide(color: Colors.grey.shade300),
                ),
              ),
            ),

            TextField(
              controller: password,
              obscureText: true,
              decoration: InputDecoration(labelText: "New Password"),
            ),

            TextField(
              controller: confirmPassword,
              obscureText: true,
              decoration:
                  InputDecoration(labelText: "Confirm Password"),
            ),

            SizedBox(height: 20),

            ElevatedButton(
              onPressed: isLoading ? null : _handleResetPassword,
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
                  : Text("Submit"),
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
          ],
        ),
      ),
    );
  }

  void _handleResetPassword() async {
    if (password.text.isEmpty || confirmPassword.text.isEmpty) {
      setState(() {
        errorMessage = 'Please enter password';
      });
      return;
    }

    if (password.text != confirmPassword.text) {
      setState(() {
        errorMessage = 'Passwords do not match';
      });
      return;
    }

    setState(() {
      isLoading = true;
      errorMessage = null;
    });

    try {
      final rollNo = email.text.isEmpty ? widget.rollNo : email.text;
      if (rollNo == null || rollNo.isEmpty) {
        throw Exception('Roll No is required');
      }

      if (widget.isFirstTime) {
        await ApiService.register(rollNo, password.text);
      } else {
        await ApiService.resetPassword(rollNo, password.text);
      }

      // After registration or reset, login automatically to get student profile for dashboard
      final loginResult = await ApiService.login(rollNo, password.text);
      if (loginResult.isEmpty || !loginResult.containsKey('student')) {
        throw Exception('Unable to login after password setup. Please try again.');
      }

      if (mounted) {
        Navigator.pushAndRemoveUntil(
          context,
          MaterialPageRoute(
            builder: (_) => DashboardScreen(rollNo: rollNo, student: loginResult),
          ),
          (route) => false,
        );
      }
    } catch (e) {
      if (mounted) {
        final message = e is Exception
            ? e.toString().replaceAll('Exception: ', '')
            : 'Unexpected error. Please try again.';
        setState(() {
          errorMessage = message;
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
