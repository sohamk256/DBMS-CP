-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: localhost    Database: organ_donation_db
-- ------------------------------------------------------
-- Server version	9.7.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ '39b2cf85-8085-11f1-9a8f-24fbe3bce06f:1-180';

--
-- Table structure for table `donor`
--

DROP TABLE IF EXISTS `donor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `donor` (
  `Donor_ID` int NOT NULL,
  `Full_Name` varchar(255) NOT NULL,
  `DOB` date NOT NULL,
  `Gender` enum('Male','Female','Other') NOT NULL,
  `Blood_Group` enum('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL,
  `Contact_Number` varchar(25) NOT NULL,
  `Email` varchar(50) NOT NULL,
  `Address` varchar(255) NOT NULL,
  `Aadhar_Num` varchar(20) NOT NULL,
  `Registration_Date` date NOT NULL,
  `Donor_Type` enum('Living','Deceased') NOT NULL,
  `Donating_Organ` enum('Kidney','Liver','Heart','Lungs','Pancreas','Multiple') NOT NULL DEFAULT 'Kidney',
  `Brain_Death_Conf` tinyint(1) NOT NULL DEFAULT '0',
  `Brain_Death_Date` datetime DEFAULT NULL,
  `Consent_Obtained` tinyint(1) NOT NULL,
  `Legal_Approval_Status` enum('pending','Approved','Rejected') NOT NULL,
  `Legal_Approval_Date` datetime DEFAULT NULL,
  `Legal_Authority` varchar(100) DEFAULT NULL,
  `Registering_Hospital_ID` int NOT NULL,
  `Medical_Fitness_Status` enum('Pending','Fit','Unfit') NOT NULL,
  `Donor_Status` enum('Registered','Evaluated','Approved','Retrieved','Rejected','Deceased') NOT NULL,
  PRIMARY KEY (`Donor_ID`),
  UNIQUE KEY `Aadhar_Num` (`Aadhar_Num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `donor`
--

LOCK TABLES `donor` WRITE;
/*!40000 ALTER TABLE `donor` DISABLE KEYS */;
INSERT INTO `donor` VALUES (126270001,'Rahul Sharma','1985-04-12','Male','O+','9876543210','rahul.s@email.com','Apt 12, Rosewood Society, Kothrud, Pune','1234 5678 9012','2026-06-15','Living','Kidney',0,NULL,1,'Approved','2026-07-01 10:30:00','State Authorization Committee',324270101,'Fit','Approved'),(126270002,'Priya Desai','1990-11-23','Female','A+','8765432109','priya.desai@email.com','B-44, Hill View, Baner, Pune','2345 6789 0123','2026-07-28','Deceased','Multiple',1,'2026-07-28 14:45:00',1,'Approved','2026-07-29 09:00:00','Zonal Transplant Coordination Center',324270102,'Fit','Retrieved'),(126270003,'Amit Patel','1992-08-05','Male','B-','7654321098','amit.patel92@email.com','Flat 101, Sky Towers, Viman Nagar, Pune','3456 7890 1234','2026-07-29','Living','Liver',0,NULL,1,'pending',NULL,NULL,324270101,'Pending','Registered'),(126270004,'Sneha Joshi','1978-02-14','Female','AB+','6543210987','sneha.joshi78@email.com','Bungalow 5, Deccan Gymkhana, Pune','4567 8901 2345','2026-06-10','Living','Kidney',0,NULL,1,'pending',NULL,NULL,324270103,'Unfit','Rejected'),(126270005,'Rohan Mehta','1965-09-30','Male','O-','5432109876','rohan.mehta@email.com','Villa 3, Green Park, Hinjewadi, Pune','5678 9012 3456','2026-07-30','Deceased','Multiple',1,'2026-07-30 08:15:00',1,'pending',NULL,NULL,324270102,'Pending','Evaluated'),(126270006,'Vikramaditya Rao','1988-03-19','Male','A-','9811223344','v.rao@email.com','Flat 301, Palm Groves, Kalyani Nagar, Pune','6789 0123 4567','2026-06-18','Living','Liver',0,NULL,1,'Approved','2026-06-25 11:15:00','State Authorization Committee',324270101,'Fit','Approved'),(126270007,'Ananya Deshpande','1995-11-02','Female','O+','8722334455','ananya.d85@email.com','Plot 42, Orchid Avenue, Aundh, Pune','7890 1234 5678','2026-08-01','Deceased','Multiple',1,'2026-08-01 19:30:00',1,'pending',NULL,NULL,324270103,'Fit','Evaluated'),(126270008,'Suresh Kadam','1973-07-14','Male','B+','7633445566','suresh.kadam@email.com','House 12, Ganesh Nagar, Dhankawadi, Pune','8901 2345 6789','2026-08-02','Living','Kidney',0,NULL,1,'pending',NULL,NULL,324270102,'Pending','Registered'),(126270009,'Sunita Agarwal','1962-05-28','Female','AB-','6544556677','agarwal.sunita@email.com','Bungalow 8, Sopan Baug, Ghorpadi, Pune','9012 3456 7890','2026-07-10','Deceased','Multiple',1,'2026-07-10 04:20:00',1,'Approved','2026-07-10 10:00:00','Zonal Transplant Coordination Center',324270101,'Fit','Retrieved'),(126270010,'Karan Bhalla','1991-09-08','Male','O-','5455667788','karan.bhalla@email.com','Flat 504, Clover Park, Viman Nagar, Pune','0123 4567 8901','2026-07-22','Living','Kidney',0,NULL,1,'Rejected','2026-07-25 16:45:00','State Authorization Committee',324270102,'Unfit','Rejected'),(126270011,'Vikram Shantaram Patil','1982-05-14','Male','O+','9822112345','vikram.patil82@gmail.com','Flat 402, Sai Heritage, Kothrud, Pune, MH','234567890123','2026-06-15','Living','Kidney',0,NULL,1,'Approved','2026-07-01 10:30:00','State Authorization Committee',324270105,'Fit','Approved'),(126270012,'Sunita Ramesh Deshmukh','1990-11-22','Female','A+','9822223456','sunita.deshmukh90@yahoo.com','Plot 12, Shivaji Nagar, Model Colony, Pune, MH','876543210987','2026-07-28','Deceased','Multiple',1,'2026-07-28 14:45:00',1,'Approved','2026-07-29 09:00:00','Zonal Transplant Coordination Center',324270106,'Fit','Retrieved'),(126270013,'Anand Prakash Joshi','1975-03-08','Male','B+','9822334567','anand.joshi75@outlook.com','78, MG Road, Camp, Pune, MH','456789123045','2026-07-29','Living','Liver',0,NULL,1,'pending',NULL,NULL,324270107,'Pending','Registered'),(126270014,'Kavita Suresh Kulkarni','1993-08-19','Female','AB+','9822445678','kavita.kulkarni93@gmail.com','B-103, Sunrise Towers, Baner, Pune, MH','981234567890','2026-06-10','Living','Kidney',0,NULL,1,'pending',NULL,NULL,324270108,'Unfit','Rejected'),(126270015,'Sanjay Bapu Shinde','1988-01-30','Male','O-','9822556789','sanjay.shinde88@rediffmail.com','54, Link Road, Andheri West, Mumbai, MH','345678901234','2026-07-30','Deceased','Multiple',1,'2026-07-30 08:15:00',1,'pending',NULL,NULL,324270109,'Pending','Evaluated'),(126270016,'Pooja Nitin Chaudhari','1996-07-12','Female','A-','9822667890','pooja.chaudhari96@gmail.com','12/A, Sea Crest Enclave, Worli, Mumbai, MH','765432109876','2026-06-18','Living','Liver',0,NULL,1,'Approved','2026-06-25 11:15:00','State Authorization Committee',324270110,'Fit','Approved'),(126270017,'Mahesh Tukaram Jadhav','1979-12-05','Male','B-','9822778901','mahesh.jadhav79@yahoo.com','House No. 45, Tilak Road, Sadashiv Peth, Pune, MH','567890123456','2026-08-01','Deceased','Multiple',1,'2026-08-01 19:30:00',1,'pending',NULL,NULL,324270111,'Fit','Evaluated'),(126270018,'Aarti Rajesh Pawar','1985-04-25','Female','AB-','9822889012','aarti.pawar85@gmail.com','301, Royal Palms, Koregaon Park, Pune, MH','654321098765','2026-08-02','Living','Kidney',0,NULL,1,'pending',NULL,NULL,324270112,'Pending','Registered'),(126270019,'Ganesh Pandurang More','1991-09-17','Male','O+','9822990123','ganesh.more91@outlook.com','Plot 88, Laxmi Nagar, Nagpur, MH','678901234567','2026-07-10','Deceased','Multiple',1,'2026-07-10 04:20:00',1,'Approved','2026-07-10 10:00:00','Zonal Transplant Coordination Center',324270113,'Fit','Retrieved'),(126270020,'Shalini Ashok Kale','1984-06-03','Female','A+','9822001234','shalini.kale84@gmail.com','Flat 12, Green Acres, Viman Nagar, Pune, MH','543210987654','2026-07-22','Living','Kidney',0,NULL,1,'Rejected','2026-07-25 16:45:00','State Authorization Committee',324270114,'Unfit','Rejected'),(126270021,'Deepak Vilas Gaikwad','1980-02-18','Male','B+','9823112345','deepak.gaikwad80@yahoo.com','Row House 4, Nanded City, Sinhagad Road, Pune, MH','789012345678','2026-07-05','Deceased','Multiple',1,'2026-07-05 12:10:00',1,'Approved','2026-07-06 08:30:00','Zonal Transplant Coordination Center',324270115,'Fit','Retrieved'),(126270022,'Meena Eknath Thorat','1994-10-29','Female','O+','9823223456','meena.thorat94@gmail.com','99, College Road, Nashik, MH','432109876543','2026-07-12','Living','Kidney',0,NULL,1,'Approved','2026-07-18 14:20:00','State Authorization Committee',324270116,'Fit','Approved'),(126270023,'Rahul Dnyaneshwar Wagh','1987-03-14','Male','A+','9823334567','rahul.wagh87@gmail.com','15, Cidco Colony, Chhatrapati Sambhajinagar, MH','890123456789','2026-07-15','Deceased','Multiple',1,'2026-07-15 02:40:00',1,'Approved','2026-07-15 09:15:00','Zonal Transplant Coordination Center',324270117,'Fit','Retrieved'),(126270024,'Swati Dattatray Jagtap','1992-12-21','Female','B+','9823445678','swati.jagtap92@outlook.com','Flat 504, Orchid Towers, Wakad, Pune, MH','321098765432','2026-07-19','Living','Liver',0,NULL,1,'pending',NULL,NULL,324270118,'Fit','Evaluated'),(126270025,'Pravin Mahadev Bhosale','1976-08-09','Male','AB+','9823556789','pravin.bhosale76@gmail.com','203, Mangalwar Peth, Kolhapur, MH','901234567890','2026-07-20','Deceased','Multiple',1,'2026-07-20 22:15:00',1,'Rejected','2026-07-21 11:00:00','Zonal Transplant Coordination Center',324270119,'Unfit','Rejected'),(126270026,'Sangeeta Balasaheb Chavan','1989-05-27','Female','O-','9823667890','sangeeta.chavan89@yahoo.com','A-4, Palm Beach Road, Sanpada, Navi Mumbai, MH','210987654321','2026-07-25','Living','Kidney',0,NULL,1,'Approved','2026-07-31 15:10:00','State Authorization Committee',324270120,'Fit','Approved'),(126270027,'Nilesh Vishnu Mane','1995-04-11','Male','A-','9823778901','nilesh.mane95@gmail.com','House 67, Old Employment Chowk, Solapur, MH','123456789012','2026-07-26','Deceased','Multiple',1,'2026-07-26 18:50:00',1,'Approved','2026-07-27 10:00:00','Zonal Transplant Coordination Center',324270121,'Fit','Retrieved'),(126270028,'Usha Subhash Mohite','1983-07-04','Female','B-','9823889012','usha.mohite83@rediffmail.com','Flat 102, Shanti Complex, Hadapsar, Pune, MH','109876543210','2026-07-27','Living','Kidney',0,NULL,1,'pending',NULL,NULL,324270122,'Pending','Registered'),(126270029,'Sachin Chandrakant Salunkhe','1981-11-15','Male','O+','9823990123','sachin.salunkhe81@gmail.com','34, Station Road, Thane West, MH','234567890124','2026-07-31','Deceased','Multiple',1,'2026-07-31 06:20:00',1,'Approved','2026-07-31 13:45:00','Zonal Transplant Coordination Center',324270123,'Fit','Retrieved'),(126270030,'Varsha Sambhaji Kadam','1997-01-08','Female','A+','9823001234','varsha.kadam97@gmail.com','B-12, Panchvati, Gangapur Road, Nashik, MH','098765432109','2026-08-01','Living','Liver',0,NULL,1,'pending',NULL,NULL,324270124,'Pending','Registered');
/*!40000 ALTER TABLE `donor` ENABLE KEYS */;
UNLOCK TABLES;
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-11-16 13:47:02
