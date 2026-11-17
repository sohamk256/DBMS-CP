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
-- Table structure for table `medicaltest`
--

DROP TABLE IF EXISTS `medicaltest`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `medicaltest` (
  `TestID` bigint NOT NULL,
  `Person_ID` int NOT NULL,
  `OrganID` bigint DEFAULT NULL,
  `TestType` varchar(100) NOT NULL,
  `TestDate` datetime DEFAULT CURRENT_TIMESTAMP,
  `TestResult` enum('Pending','Normal','Abnormal','Positive','Negative') NOT NULL,
  `ResultDetails` varchar(255) DEFAULT NULL,
  `ConductedByHospitalID` bigint NOT NULL,
  `LabName` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`TestID`),
  KEY `fk_medicaltest_organ` (`OrganID`),
  KEY `fk_medicaltest_hospital` (`ConductedByHospitalID`),
  CONSTRAINT `fk_medicaltest_hospital` FOREIGN KEY (`ConductedByHospitalID`) REFERENCES `hospital` (`Hospital_ID`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_medicaltest_organ` FOREIGN KEY (`OrganID`) REFERENCES `organ` (`OrganID`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `medicaltest`
--

LOCK TABLES `medicaltest` WRITE;
/*!40000 ALTER TABLE `medicaltest` DISABLE KEYS */;
INSERT INTO `medicaltest` VALUES (426270001,126270001,NULL,'Blood Group Confirmation','2025-10-10 09:00:00','Normal','Forward/reverse typing confirmed',324270101,'Central Pathology & Blood Bank Lab'),(426270002,126270002,NULL,'Blood Group Confirmation','2025-10-12 10:00:00','Normal','ABO/Rh positive confirmed',324270103,'Transfusion Medicine Lab'),(426270003,126270003,NULL,'Blood Group Confirmation','2025-12-10 11:00:00','Normal','Universal donor confirmed',324270102,'Clinical Hematology Diagnostics'),(426270004,126270004,NULL,'Cardiac Assessment','2025-12-19 15:00:00','Normal','ECHO LVEF > 60%',324270104,'Cardiology Diagnostic Wing'),(426270005,126270005,NULL,'Liver Function Test','2026-01-14 19:00:00','Normal','Enzymes within limits',324270101,'Biochemistry Core Lab'),(426270006,126270006,NULL,'Pulmonary Assessment','2026-01-19 23:00:00','Normal','ABG PaO2 adequate',324270102,'Pulmonary & Respiratory Diagnostics'),(426270007,126270007,NULL,'Corneal Examination','2026-01-24 20:00:00','Normal','Cell count sufficient',324270103,'Ophthalmology & Tissue Bank Lab'),(426270008,126270008,NULL,'Pancreatic Assessment','2026-01-27 17:00:00','Normal','Enzymes within limits',324270104,'Clinical Biochemistry Lab'),(426270009,126270009,NULL,'Viral Screening','2026-01-31 05:00:00','Negative','All markers non-reactive',324270101,'Microbiology & Serology Department'),(426270010,126270010,NULL,'Kidney Function Test','2026-02-12 09:00:00','Normal','Creatinine levels normal',324270102,'Nephrology Pathology Diagnostics'),(426270011,126270001,226270001,'Organ Viability Test','2025-11-01 09:00:00','Normal','Zero ischemia injury',324270101,'Transplant Immunology & Pathology Lab'),(426270012,126270002,226270002,'Organ Viability Test','2025-11-05 10:00:00','Normal','Normal tissue parenchyma',324270103,'Organ Preservation & Histology Unit'),(426270013,126270003,226270003,'Organ Viability Test','2026-01-10 09:00:00','Normal','Vascular supply intact',324270102,'Organ Assessment Unit'),(426270014,126270004,226270004,'Organ Viability Test','2025-12-20 14:30:00','Normal','Coronary vessels clear',324270104,'Cardiothoracic Surgery Pathology'),(426270015,126270005,226270005,'Organ Viability Test','2026-01-15 10:30:00','Normal','Active bile production',324270101,'Hepatology Tissue Lab'),(426270016,126270006,226270006,'Organ Viability Test','2026-01-20 09:30:00','Normal','Good lung compliance',324270102,'Pulmonary & Thoracic Care Diagnostics'),(426270017,126270007,226270007,'Organ Viability Test','2026-01-25 11:30:00','Normal','Intact epithelial layer',324270103,'Ophthalmology & Tissue Bank Lab'),(426270018,126270008,226270008,'Organ Viability Test','2026-01-28 08:30:00','Normal','No capsular tears',324270104,'Gastroenterology Core Lab'),(426270019,126270009,226270009,'Organ Viability Test','2026-02-01 09:30:00','Normal','Good arterial perfusion',324270101,'Surgical Pathology Department'),(426270020,126270010,226270010,'Organ Viability Test','2026-02-15 08:30:00','Normal','Glomerular clearance intact',324270102,'Nephrology Pathology Diagnostics'),(426270021,625270011,NULL,'HLA Typing','2025-10-20 10:00:00','Normal','Allele profile generated',324270101,'Immunogenetics & HLA Diagnostics Lab'),(426270022,625270011,NULL,'Crossmatch','2025-10-25 11:00:00','Negative','CDC crossmatch negative',324270101,'Immunogenetics & HLA Diagnostics Lab'),(426270023,625270012,NULL,'Crossmatch','2025-10-27 12:00:00','Negative','Flow crossmatch negative',324270103,'Transfusion Medicine Lab'),(426270024,625270013,NULL,'Crossmatch','2025-12-25 09:00:00','Negative','CDC crossmatch negative',324270102,'Clinical Hematology Diagnostics'),(426270025,625270014,NULL,'Pre-transplant Evaluation','2025-12-05 14:00:00','Normal','Surgical clearance granted',324270104,'Cardiology Diagnostic Wing'),(426270026,625270015,NULL,'Liver Function Test','2025-11-10 10:00:00','Abnormal','Elevated serum bilirubin',324270101,'Biochemistry Core Lab'),(426270027,625270016,NULL,'Pulmonary Assessment','2025-11-15 11:00:00','Abnormal','Reduced lung volume',324270102,'Pulmonary & Respiratory Diagnostics'),(426270028,625270017,NULL,'Corneal Examination','2025-11-20 12:00:00','Abnormal','Severe corneal opacity',324270103,'Ophthalmology & Tissue Bank Lab'),(426270029,625270018,NULL,'Pancreatic Assessment','2025-11-25 10:00:00','Abnormal','Poor glycemic control',324270104,'Clinical Biochemistry Lab'),(426270030,625270019,NULL,'Pre-transplant Evaluation','2025-11-28 09:00:00','Normal','Anesthetic clearance given',324270101,'Central Pathology & Blood Bank Lab'),(426270031,625270020,NULL,'Kidney Function Test','2025-12-01 10:00:00','Abnormal','Stage 5 CKD',324270103,'Nephrology Pathology Diagnostics'),(426270032,625270021,NULL,'Kidney Function Test','2025-12-03 11:00:00','Abnormal','Critically high creatinine',324270102,'Nephrology Pathology Diagnostics'),(426270033,625270022,NULL,'Kidney Function Test','2025-12-05 15:00:00','Abnormal','Severe renal impairment',324270104,'Clinical Biochemistry Lab');
/*!40000 ALTER TABLE `medicaltest` ENABLE KEYS */;
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
