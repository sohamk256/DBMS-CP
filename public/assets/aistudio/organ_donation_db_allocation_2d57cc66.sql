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
-- Table structure for table `allocation`
--

DROP TABLE IF EXISTS `allocation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `allocation` (
  `AllocationID` bigint NOT NULL,
  `OrganID` bigint NOT NULL,
  `RecipientID` int NOT NULL,
  `AllocationDate` datetime DEFAULT CURRENT_TIMESTAMP,
  `CompatibilityVerified` tinyint(1) DEFAULT '0',
  `CompatibilityScore` decimal(5,2) DEFAULT NULL,
  `AllocationStatus` enum('Proposed','Confirmed','Rejected','Completed','Cancelled') DEFAULT 'Proposed',
  `TransplantHospitalID` bigint NOT NULL,
  `TransportMode` enum('Road','Air','Green Corridor') DEFAULT NULL,
  `GreenCorridorUsed` tinyint(1) DEFAULT '0',
  `TransportStartTime` datetime DEFAULT NULL,
  `TransportEndTime` datetime DEFAULT NULL,
  `TransplantSurgeryDate` datetime DEFAULT NULL,
  `LeadSurgeon` varchar(100) DEFAULT NULL,
  `TransplantOutcome` enum('Successful','Failed','Complication','Not Performed') DEFAULT NULL,
  `RecoveryStatus` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`AllocationID`),
  KEY `fk_allocation_organ` (`OrganID`),
  KEY `fk_allocation_hospital` (`TransplantHospitalID`),
  CONSTRAINT `fk_allocation_hospital` FOREIGN KEY (`TransplantHospitalID`) REFERENCES `hospital` (`Hospital_ID`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_allocation_organ` FOREIGN KEY (`OrganID`) REFERENCES `organ` (`OrganID`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `allocation`
--

LOCK TABLES `allocation` WRITE;
/*!40000 ALTER TABLE `allocation` DISABLE KEYS */;
INSERT INTO `allocation` VALUES (526270001,226270001,725270011,'2025-11-01 10:00:00',1,98.00,'Completed',324270101,'Road',0,'2025-11-01 11:00:00','2025-11-01 12:30:00','2025-11-02 08:00:00','Dr. Ashok Deshpande','Successful','Stable'),(526270002,226270002,725270012,'2025-11-05 11:00:00',1,96.00,'Completed',324270103,'Road',0,'2025-11-05 12:00:00','2025-11-05 13:15:00','2025-11-06 09:00:00','Dr. Meenal Kulkarni','Successful','Stable'),(526270003,226270003,725270013,'2026-01-10 10:00:00',1,95.00,'Confirmed',324270102,'Road',0,NULL,NULL,NULL,NULL,NULL,NULL),(526270004,226270004,725270014,'2025-12-20 15:00:00',1,97.00,'Confirmed',324270104,'Green Corridor',1,'2025-12-20 15:30:00','2025-12-20 16:15:00',NULL,NULL,NULL,NULL),(526270005,226270011,725270035,'2026-03-15 08:30:00',1,95.00,'Completed',324270105,'Road',0,'2026-03-15 09:15:00','2026-03-15 10:00:00','2026-03-16 07:30:00','Dr. Ashok Deshpande','Successful','Stable'),(526270006,226270012,725270036,'2026-03-18 11:00:00',1,91.50,'Completed',324270106,'Green Corridor',1,'2026-03-18 11:45:00','2026-03-18 12:20:00','2026-03-19 08:00:00','Dr. Meenal Kulkarni','Successful','Recovering'),(526270007,226270013,725270037,'2026-03-20 14:15:00',1,88.00,'Confirmed',324270107,'Air',1,'2026-03-20 15:00:00','2026-03-20 16:15:00',NULL,NULL,'Not Performed',NULL),(526270008,226270014,725270038,'2026-03-22 09:45:00',1,97.00,'Completed',324270108,'Road',0,'2026-03-22 10:30:00','2026-03-22 11:10:00','2026-03-23 09:00:00','Dr. Ashok Deshpande','Successful','Stable'),(526270009,226270015,725270039,'2026-03-25 16:20:00',1,92.50,'Cancelled',324270109,'Road',0,NULL,NULL,NULL,NULL,'Failed','Complications'),(526270010,226270016,725270040,'2026-03-28 10:00:00',1,89.50,'Confirmed',324270110,'Green Corridor',1,'2026-03-28 10:45:00','2026-03-28 11:20:00',NULL,NULL,'Not Performed',NULL),(526270011,226270017,725270041,'2026-03-30 13:30:00',1,96.00,'Completed',324270111,'Road',0,'2026-03-30 14:15:00','2026-03-30 15:00:00','2026-03-31 08:30:00','Dr. Meenal Kulkarni','Successful','Stable'),(526270012,226270018,725270042,'2026-04-02 07:45:00',0,90.00,'Proposed',324270112,'Road',0,NULL,NULL,NULL,NULL,'Not Performed',NULL),(526270013,226270019,725270043,'2026-04-05 18:10:00',1,94.50,'Completed',324270113,'Air',1,'2026-04-05 19:00:00','2026-04-05 20:15:00','2026-04-06 06:00:00','Dr. Ashok Deshpande','Complication','Critical'),(526270014,226270020,725270044,'2026-04-08 12:00:00',1,93.00,'Confirmed',324270114,'Road',0,'2026-04-08 12:40:00','2026-04-08 13:25:00',NULL,NULL,'Not Performed',NULL),(526270015,226270021,725270045,'2026-04-10 15:20:00',1,87.50,'Completed',324270115,'Green Corridor',1,'2026-04-10 16:00:00','2026-04-10 16:30:00','2026-04-11 09:15:00','Dr. Meenal Kulkarni','Successful','Stable'),(526270016,226270022,725270046,'2026-04-12 11:30:00',1,98.00,'Completed',324270116,'Road',0,'2026-04-12 12:10:00','2026-04-12 12:50:00','2026-04-13 07:45:00','Dr. Ashok Deshpande','Successful','Recovering'),(526270017,226270023,725270047,'2026-04-15 09:00:00',0,92.00,'Proposed',324270117,'Road',0,NULL,NULL,NULL,NULL,'Not Performed',NULL),(526270018,226270024,725270048,'2026-04-18 17:00:00',1,95.50,'Confirmed',324270118,'Green Corridor',1,'2026-04-18 17:40:00','2026-04-18 18:15:00',NULL,NULL,'Not Performed',NULL),(526270019,226270025,725270049,'2026-04-20 14:15:00',1,86.00,'Completed',324270119,'Road',0,'2026-04-20 15:00:00','2026-04-20 15:40:00','2026-04-21 10:00:00','Dr. Meenal Kulkarni','Successful','Stable'),(526270020,226270026,725270050,'2026-04-22 08:30:00',1,96.50,'Completed',324270120,'Air',1,'2026-04-22 09:15:00','2026-04-22 10:30:00','2026-04-23 08:00:00','Dr. Ashok Deshpande','Successful','Stable'),(526270021,226270027,725270051,'2026-04-25 10:45:00',1,91.00,'Confirmed',324270121,'Road',0,'2026-04-25 11:30:00','2026-04-25 12:15:00',NULL,NULL,'Not Performed',NULL),(526270022,226270028,725270052,'2026-04-28 16:00:00',1,94.00,'Completed',324270122,'Green Corridor',1,'2026-04-28 16:45:00','2026-04-28 17:20:00','2026-04-29 09:30:00','Dr. Meenal Kulkarni','Successful','Recovering'),(526270023,226270029,725270053,'2026-04-30 13:10:00',1,87.00,'Rejected',324270123,'Road',0,NULL,NULL,NULL,NULL,'Failed','Organ Rejected'),(526270024,226270030,725270054,'2026-05-02 11:25:00',1,98.50,'Completed',324270124,'Road',0,'2026-05-02 12:00:00','2026-05-02 12:40:00','2026-05-03 07:30:00','Dr. Ashok Deshpande','Successful','Stable');
/*!40000 ALTER TABLE `allocation` ENABLE KEYS */;
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
