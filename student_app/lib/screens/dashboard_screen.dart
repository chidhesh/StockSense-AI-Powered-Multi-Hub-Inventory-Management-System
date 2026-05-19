import 'package:flutter/material.dart';
import 'project_input_screen.dart';
import 'history_screen.dart';
import 'inventory_screen.dart';
import 'login_screen.dart';
import 'recent_projects_screen.dart';
import 'student_qr_screen.dart';
import '../services/api_service.dart';

class DashboardScreen extends StatefulWidget {
  final String? rollNo;
  final Map<String, dynamic>? student;

  DashboardScreen({this.rollNo, this.student});

  @override
  _DashboardScreenState createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late Future<Map<String, dynamic>> dashboardFuture;
  String? studentName;
  String? centerId;
  String centerName = "Mangalore Center";

  @override
  void initState() {
    super.initState();
    if (widget.rollNo != null) {
      dashboardFuture = ApiService.getDashboard(widget.rollNo!);
      _loadStudentInfo();
    } else {
      dashboardFuture = Future.value({});
    }
  }

  void _loadStudentInfo() {
    if (widget.student != null) {
      final student = widget.student!['student'];
      if (student is Map<String, dynamic>) {
        setState(() {
          studentName = student['full_name'] ?? 'Student';
          centerId = student['center_id'];
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        elevation: 0,
        title: Text("Dashboard"),
        backgroundColor: Colors.blue,
        actions: [
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value == 'logout') {
                Navigator.pushAndRemoveUntil(
                  context,
                  MaterialPageRoute(builder: (_) => LoginScreen()),
                  (route) => false,
                );
              }
            },
            itemBuilder: (context) => [
              PopupMenuItem(
                value: 'logout',
                child: Row(
                  children: [
                    Icon(Icons.logout, color: Colors.red),
                    SizedBox(width: 10),
                    Text("Sign Out"),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),

      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [Colors.blue.shade700, Colors.blue.shade200],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: FutureBuilder<Map<String, dynamic>>(
            future: dashboardFuture,
            builder: (context, snapshot) {
              if (snapshot.connectionState == ConnectionState.waiting) {
                return Center(child: CircularProgressIndicator());
              }

              if (snapshot.hasError) {
                return Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('Error: ${snapshot.error}',
                          style: TextStyle(color: Colors.red)),
                      SizedBox(height: 20),
                      ElevatedButton(
                        onPressed: () {
                          setState(() {
                            if (widget.rollNo != null) {
                              dashboardFuture =
                                  ApiService.getDashboard(widget.rollNo!);
                            }
                          });
                        },
                        child: Text('Retry'),
                      ),
                    ],
                  ),
                );
              }

              final data = snapshot.data ?? {};
              final stats = data['stats'] ?? {
                'issued': 0,
                'returned': 0,
                'pending': 0
              };
              final inventorySnapshot = data['inventory'] ?? [];

              return SingleChildScrollView(
                padding: EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // 🔹 HEADER
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 28,
                          backgroundColor: Colors.white,
                          child: Icon(Icons.person,
                              size: 30, color: Colors.blue),
                        ),
                        SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                                "Hello, ${studentName ?? 'Student'} 👋",
                                style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold)),
                            Text(centerName,
                                style:
                                    TextStyle(color: Colors.white70)),
                          ],
                        )
                      ],
                    ),

                    SizedBox(height: 20),

                    // 🔹 STATS
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _statCard("Issued",
                            stats['issued'].toString(), Colors.orange),
                        _statCard("Returned",
                            stats['returned'].toString(), Colors.green),
                        _statCard("Pending",
                            stats['pending'].toString(), Colors.red),
                      ],
                    ),

                    SizedBox(height: 25),

                    // 🔹 QUICK ACTIONS
                    Text("Quick Actions",
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold)),

                    SizedBox(height: 10),

                    GridView.count(
                      shrinkWrap: true,
                      physics: NeverScrollableScrollPhysics(),
                      crossAxisCount: 2,
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                      children: [
                        _menuCard(context, "Project", Icons.add_circle,
                            ProjectInputScreen(rollNo: widget.rollNo)),
                        _menuCard(context, "My QR", Icons.qr_code,
                            StudentQR(rollNo: widget.rollNo ?? '', studentName: studentName)),
                        _menuCard(context, "History", Icons.history,
                            HistoryScreen(rollNo: widget.rollNo)),
                        _menuCard(context, "Inventory", Icons.inventory,
                            InventoryScreen(centerId: centerId)),
                        _menuCard(context, "Recent Projects",
                            Icons.lightbulb, RecentProjectsScreen(rollNo: widget.rollNo)),
                      ],
                    ),

                    SizedBox(height: 25),

                    // 🔹 INVENTORY SNAPSHOT
                    Text("Inventory Snapshot (Items Held)",
                        style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold)),

                    SizedBox(height: 10),

                    if (inventorySnapshot.isEmpty)
                      Card(
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(15)),
                        child: Padding(
                          padding: EdgeInsets.all(16),
                          child: Text('No items currently held'),
                        ),
                      )
                    else
                      Card(
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(15)),
                        child: Column(
                          children: List.generate(
                            inventorySnapshot.length,
                            (index) {
                              final item = inventorySnapshot[index];
                              return _inventoryTile(
                                  item['name'] ?? 'Unknown',
                                  item['held_quantity'].toString());
                            },
                          ),
                        ),
                      ),

                    SizedBox(height: 25),

                    // 🔹 RECENT ACTIVITY
                    Text("Recent Activity",
                        style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold)),

                    SizedBox(height: 10),

                    Card(
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(15)),
                      child: Column(
                        children: [
                          ListTile(
                            leading: Icon(Icons.check_circle,
                                color: Colors.green),
                            title: Text("Arduino Returned"),
                          ),
                          ListTile(
                            leading: Icon(Icons.pending,
                                color: Colors.orange),
                            title: Text("IR Sensor Pending"),
                          ),
                        ],
                      ),
                    ),

                    SizedBox(height: 25),

                    // 🔹 AI RECOMMENDATION CARD
                    Card(
                      elevation: 6,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(15)),
                      child: ListTile(
                        leading: Icon(Icons.auto_awesome,
                            color: Colors.blue),
                        title: Text("AI Recommendation"),
                        subtitle: Text(
                            "Get smart suggestions for your project"),
                        trailing: Icon(Icons.arrow_forward_ios),
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (_) =>
                                    ProjectInputScreen()),
                          );
                        },
                      ),
                    ),

                    SizedBox(height: 20),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  // 🔹 STAT CARD
  Widget _statCard(String title, String value, Color color) {
    return Expanded(
      child: Card(
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
        child: Padding(
          padding: EdgeInsets.all(12),
          child: Column(
            children: [
              Text(value,
                  style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: color)),
              SizedBox(height: 5),
              Text(title),
            ],
          ),
        ),
      ),
    );
  }

  // 🔹 MENU CARD
  Widget _menuCard(
      BuildContext context, String title, IconData icon, Widget screen) {
    return InkWell(
      onTap: () {
        Navigator.push(
            context, MaterialPageRoute(builder: (_) => screen));
      },
      child: Card(
        elevation: 6,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 40, color: Colors.blue),
            SizedBox(height: 10),
            Text(title,
                style: TextStyle(
                    fontWeight: FontWeight.bold, fontSize: 14)),
          ],
        ),
      ),
    );
  }

  // 🔹 INVENTORY TILE
  Widget _inventoryTile(String name, String count) {
    return ListTile(
      title: Text(name),
      trailing: Text(count,
          style: TextStyle(
              fontWeight: FontWeight.bold, color: Colors.blue)),
    );
  }
}