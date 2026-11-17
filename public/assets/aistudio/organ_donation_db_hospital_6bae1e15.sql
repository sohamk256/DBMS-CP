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
-- Table structure for table `hospital`
--

DROP TABLE IF EXISTS `hospital`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hospital` (
  `Hospital_ID` bigint NOT NULL,
  `Hospital_Name` varchar(150) NOT NULL,
  `Hospital_Type` enum('Government','Private','Trust') NOT NULL,
  `City` varchar(50) NOT NULL,
  `State` varchar(50) NOT NULL,
  `Contact_Number` varchar(15) NOT NULL,
  `Email` varchar(100) DEFAULT NULL,
  `License_Number` varchar(50) NOT NULL,
  `Transplant_Center_Certified` tinyint(1) DEFAULT '0',
  `Registration_Date` date DEFAULT (curdate()),
  PRIMARY KEY (`Hospital_ID`),
  UNIQUE KEY `License_Number` (`License_Number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `hospital`
--

LOCK TABLES `hospital` WRITE;
/*!40000 ALTER TABLE `hospital` DISABLE KEYS */;
INSERT INTO `hospital` VALUES (324270101,'Sassoon General Hospital','Government','Pune','Maharashtra','020-26128000',NULL,'LIC-MH-PUN-001',1,'2026-08-13'),(324270102,'King Edward Memorial Hospital','Government','Mumbai','Maharashtra','022-24107000',NULL,'LIC-MH-MUM-002',1,'2026-08-13'),(324270103,'Ruby Hall Clinic','Private','Pune','Maharashtra','020-66455100',NULL,'LIC-MH-PUN-003',1,'2026-08-13'),(324270104,'Jaslok Hospital','Private','Mumbai','Maharashtra','022-66573333',NULL,'LIC-MH-MUM-004',1,'2026-08-13'),(324270105,'Deenanath Mangeshkar Hospital','Private','Pune','Maharashtra','02066023000',NULL,'MH-PUN-005',0,'2026-09-03'),(324270106,'Sahyadri Super Speciality Hospital','Private','Pune','Maharashtra','02067213000',NULL,'MH-PUN-006',0,'2026-09-03'),(324270107,'Jupiter Hospital','Private','Pune','Maharashtra','02027992799',NULL,'MH-PUN-007',0,'2026-09-03'),(324270108,'Lilavati Hospital & Research Centre','Private','Mumbai','Maharashtra','02226751000',NULL,'MH-MUM-015',0,'2026-09-03'),(324270109,'Bombay Hospital','Private','Mumbai','Maharashtra','02222067676',NULL,'MH-MUM-016',0,'2026-09-03'),(324270110,'Kokilaben Dhirubhai Ambani Hospital','Private','Mumbai','Maharashtra','02230696969',NULL,'MH-MUM-017',0,'2026-09-03'),(324270111,'Grant Medical College & JJ Hospital','Government','Mumbai','Maharashtra','02223735555',NULL,'MH-MUM-018',0,'2026-09-03'),(324270112,'Government Medical College Hospital','Government','Nagpur','Maharashtra','07122744437',NULL,'MH-NAG-001',0,'2026-09-03'),(324270113,'Orange City Hospital','Private','Nagpur','Maharashtra','07122238431',NULL,'MH-NAG-002',0,'2026-09-03'),(324270114,'MGM Medical College & Hospital','Private','Chhatrapati Sambhajinagar','Maharashtra','02406601100',NULL,'MH-AUR-001',0,'2026-09-03'),(324270115,'Ghati Government Hospital','Government','Chhatrapati Sambhajinagar','Maharashtra','02402403333',NULL,'MH-AUR-002',0,'2026-09-03'),(324270116,'Ashoka Medicover Hospitals','Private','Nashik','Maharashtra','02536633333',NULL,'MH-NAS-001',0,'2026-09-03'),(324270117,'Sahyadri Hospital Nashik','Private','Nashik','Maharashtra','02536691000',NULL,'MH-NAS-002',0,'2026-09-03'),(324270118,'Solapur Civil Hospital','Government','Solapur','Maharashtra','02172740001',NULL,'MH-SOL-001',0,'2026-09-03'),(324270119,'Dr. D. Y. Patil Medical College','Private','Kolhapur','Maharashtra','02312601234',NULL,'MH-KOL-001',0,'2026-09-03'),(324270120,'Aster Aadhar Hospital','Private','Kolhapur','Maharashtra','02316616000',NULL,'MH-KOL-002',0,'2026-09-03'),(324270121,'Manipal Hospital Pune','Private','Pune','Maharashtra','02061606160',NULL,'MH-PUN-008',0,'2026-09-03'),(324270122,'Bharati Vidyapeeth Hospital','Private','Pune','Maharashtra','02024373226',NULL,'MH-PUN-009',0,'2026-09-03'),(324270123,'Nanavati Max Super Speciality Hospital','Private','Mumbai','Maharashtra','02226267500',NULL,'MH-MUM-019',0,'2026-09-03'),(324270124,'Breach Candy Hospital','Private','Mumbai','Maharashtra','02223667788',NULL,'MH-MUM-020',0,'2026-09-03');
/*!40000 ALTER TABLE `hospital` ENABLE KEYS */;
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

-- Dump completed on 2026-11-16 13:47:03
