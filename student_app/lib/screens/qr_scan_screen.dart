import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'reset_password_screen.dart';

class QRScanScreen extends StatefulWidget {
  @override
  _QRScanScreenState createState() => _QRScanScreenState();
}

class _QRScanScreenState extends State<QRScanScreen> {
  final MobileScannerController _cameraController = MobileScannerController();
  bool _hasScanned = false;
  String? _scanError;

  @override
  void dispose() {
    _cameraController.dispose();
    super.dispose();
  }

  String? _extractRollNo(String rawValue) {
    final value = rawValue.trim();
    if (value.isEmpty) return null;

    try {
      final dynamic parsed = jsonDecode(value);
      if (parsed is Map<String, dynamic>) {
        return parsed['rollNumber']?.toString() ?? 
               parsed['roll_no']?.toString() ?? 
               parsed['rollNo']?.toString();
      }
    } catch (_) {}

    final uri = Uri.tryParse(value);
    if (uri != null && uri.queryParameters.isNotEmpty) {
      return uri.queryParameters['rollNumber'] ??
             uri.queryParameters['roll_no'] ??
             uri.queryParameters['rollNo'];
    }

    final regex = RegExp(r'roll[_-]?no[:=]\s*([\w-]+)', caseSensitive: false);
    final match = regex.firstMatch(value);
    if (match != null) {
      return match.group(1);
    }

    return value;
  }

  void _handleBarcode(BarcodeCapture capture) {
    if (_hasScanned) return;

    for (final barcode in capture.barcodes) {
      final String? rawValue = barcode.rawValue;
      debugPrint('--- BARCODE DETECTED ---');
      debugPrint('Raw Value: $rawValue');

      if (rawValue == null || rawValue.isEmpty) continue;

      final String? rollNo = _extractRollNo(rawValue);
      debugPrint('Extracted Roll No: $rollNo');

      if (rollNo == null || rollNo.isEmpty) {
        setState(() {
          _scanError = 'Invalid Student QR. Please use the QR code provided by the administrator.';
        });
        continue;
      }

      _hasScanned = true;
      _cameraController.stop();
      
      debugPrint('Navigating to ResetPasswordScreen with Roll No: $rollNo');
      
      // Use a small delay to ensure camera stops smoothly
      Future.delayed(Duration(milliseconds: 100), () {
        if (mounted) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (_) => ResetPasswordScreen(rollNo: rollNo, isFirstTime: true),
            ),
          );
        }
      });
      return;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Scan QR')),
      body: Stack(
        children: [
          MobileScanner(
            controller: _cameraController,
            onDetect: _handleBarcode,
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: Container(
              width: double.infinity,
              padding: EdgeInsets.all(16),
              color: Colors.black54,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Point the camera at the student QR code.',
                    style: TextStyle(color: Colors.white),
                    textAlign: TextAlign.center,
                  ),
                  if (_scanError != null)
                    Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Text(
                        _scanError!,
                        style: TextStyle(color: Colors.redAccent),
                        textAlign: TextAlign.center,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
