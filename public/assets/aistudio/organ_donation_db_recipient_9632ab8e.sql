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
-- Table structure for table `recipient`
--

DROP TABLE IF EXISTS `recipient`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `recipient` (
  `Recipient_ID` bigint NOT NULL,
  `Full_Name` varchar(255) NOT NULL,
  `DOB` date NOT NULL,
  `Gender` enum('Male','Female','Other') NOT NULL,
  `Blood_Group` enum('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL,
  `Contact_Number` varchar(25) NOT NULL,
  `Email` varchar(50) NOT NULL,
  `Address` varchar(255) NOT NULL,
  `Aadhar_Num` varchar(20) NOT NULL,
  `RequiredOrgan` enum('Kidney','Liver','Heart','Lung','Pancreas','Cornea','Small Intestine') NOT NULL,
  `UrgencyLevel` enum('Routine','Urgent','Critical','Emergency') DEFAULT 'Routine',
  `PriorityScore` decimal(5,2) DEFAULT '0.00',
  `RegistrationDate` date DEFAULT (curdate()),
  `RegisteringHospitalID` bigint NOT NULL,
  `RecipientStatus` enum('Waiting','Allocated','Transplanted','Removed','Deceased') DEFAULT 'Waiting',
  `RemovalReason` varchar(255) DEFAULT NULL,
  `Previous_Transplant_History` tinyint(1) NOT NULL DEFAULT '0',
  `Attending_Physician` varchar(100) NOT NULL DEFAULT 'Dr. Unassigned',
  `Disease` varchar(150) NOT NULL DEFAULT 'Undisclosed',
  PRIMARY KEY (`Recipient_ID`),
  UNIQUE KEY `Aadhar_Num` (`Aadhar_Num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `recipient`
--

LOCK TABLES `recipient` WRITE;
/*!40000 ALTER TABLE `recipient` DISABLE KEYS */;
INSERT INTO `recipient` VALUES (625270001,'Ananya Deshmukh','1991-03-14','Female','O+','+91-9823011111','ananya.d@email.com','Flat 402, Sunshine Apts, Kothrud, Pune','9012 3456 7890','Kidney','Emergency',100.00,'2025-09-15',324270101,'Transplanted',NULL,0,'Dr. Suresh Joshi','End-Stage Renal Disease (ESRD)'),(625270002,'Siddharth Kulkarni','1983-07-22','Male','A+','+91-9823022222','sid.kulkarni@email.com','Plot 18, Mayur Colony, Karve Nagar, Pune','9012 3456 7891','Kidney','Urgent',65.00,'2025-09-20',324270102,'Transplanted',NULL,1,'Dr. Suresh Joshi','Chronic Glomerulonephritis'),(625270003,'Vikram Shinde','1976-11-05','Male','B+','+91-9823033333','vikram.s@email.com','A-12, Seasons Society, Hadapsar, Pune','9012 3456 7892','Kidney','Routine',45.00,'2025-11-01',324270101,'Allocated',NULL,0,'Dr. Priya Ranade','Polycystic Kidney Disease (PKD)'),(625270004,'Neha Verma','1995-01-30','Female','AB+','+91-9823044444','neha.v@email.com','B-303, Sky Line, Wakad, Pune','9012 3456 7893','Heart','Critical',88.00,'2025-10-10',324270103,'Allocated',NULL,0,'Dr. Rajesh Deshmukh','Dilated Cardiomyopathy'),(625270005,'Rajesh Pawar','1968-09-18','Male','O-','+91-9823055555','rajesh.pawar@email.com','House 45, Model Colony, Shivajinagar, Pune','9012 3456 7894','Liver','Critical',85.00,'2025-11-05',324270102,'Waiting',NULL,0,'Dr. Anand Kelkar','Decompensated Cirrhosis (NASH)'),(625270006,'Pooja Gaikwad','1989-12-11','Female','A-','+91-9823066666','pooja.g@email.com','Flat 101, Rose Residency, Baner, Pune','9012 3456 7895','Lung','Critical',90.00,'2025-11-08',324270101,'Waiting',NULL,0,'Dr. Smita Patil','Idiopathic Pulmonary Fibrosis (IPF)'),(625270007,'Suresh Patil','1958-05-25','Male','B-','+91-9823077777','suresh.patil@email.com','Bungalow 7, Koregaon Park, Pune','9012 3456 7896','Cornea','Routine',42.00,'2025-11-12',324270103,'Waiting',NULL,0,'Dr. Nitin Kulkarni','Keratoconus'),(625270008,'Kavita Chawla','1992-08-17','Female','O+','+91-9823088888','kavita.c@email.com','A-5, Green Acres, Viman Nagar, Pune','9012 3456 7897','Pancreas','Urgent',68.00,'2025-11-15',324270102,'Waiting',NULL,0,'Dr. Priya Ranade','Type 1 Diabetes Mellitus with Severe Complications'),(625270009,'Manoj Jagtap','1980-04-03','Male','AB-','+91-9823099999','manoj.jagtap@email.com','Flat 202, Royal Palms, Pimple Saudagar, Pune','9012 3456 7898','Small Intestine','Urgent',62.00,'2025-11-18',324270101,'Waiting',NULL,0,'Dr. Anand Kelkar','Short Bowel Syndrome'),(625270010,'Aditi Kulkarni','1998-10-09','Female','A+','+91-9823000001','aditi.k@email.com','C-12, Choice Paradise, Bavdhan, Pune','9012 3456 7899','Kidney','Routine',48.00,'2025-11-22',324270103,'Waiting',NULL,0,'Dr. Suresh Joshi','Diabetic Nephropathy'),(625270011,'Nitin Gadkari','1973-02-28','Male','B+','+91-9823000002','nitin.g@email.com','Flat 501, Heritage Towers, Camp, Pune','9012 3456 7900','Kidney','Urgent',66.00,'2025-11-25',324270102,'Waiting',NULL,1,'Dr. Priya Ranade','Hypertensive Nephrosclerosis'),(625270012,'Meera Nair','1987-06-19','Female','O+','+91-9823000003','meera.nair@email.com','Villa 14, Silver Oak, Kalyani Nagar, Pune','9012 3456 7901','Kidney','Emergency',97.00,'2025-11-28',324270101,'Waiting',NULL,0,'Dr. Suresh Joshi','Acute Kidney Injury on Chronic Renal Failure'),(625270013,'Rohan Vijay Shinde','1985-04-12','Male','O+','+91-9823000004','rohan.s@email.com','Flat 301, Silver Oak, Aundh, Pune','901234567902','Kidney','Critical',92.50,'2025-12-01',324270101,'Waiting',NULL,0,'Dr. Suresh Joshi','End-Stage Renal Disease (ESRD)'),(625270014,'Priya Santosh More','1990-09-25','Female','A+','+91-9823000005','priya.m@email.com','Plot 45, Greenfield, Baner, Pune','901234567903','Liver','Urgent',78.00,'2025-12-03',324270102,'Waiting',NULL,0,'Dr. Anand Kelkar','Decompensated Cirrhosis (NASH)'),(625270015,'Amit Dattatray Kulkarni','1978-11-18','Male','B+','+91-9823000006','amit.k@email.com','B-12, Harmony Heights, Wakad, Pune','901234567904','Heart','Critical',95.00,'2025-12-05',324270103,'Allocated',NULL,0,'Dr. Rajesh Deshmukh','Dilated Cardiomyopathy'),(625270016,'Snehal Ramesh Jadhav','1993-02-14','Female','AB+','+91-9823000007','snehal.j@email.com','A-4, Sky Towers, Kothrud, Pune','901234567905','Kidney','Routine',40.00,'2025-12-08',324270101,'Waiting',NULL,1,'Dr. Priya Ranade','Polycystic Kidney Disease (PKD)'),(625270017,'Nilesh Balasaheb Pawar','1982-06-30','Male','O-','+91-9823000008','nilesh.p@email.com','House 88, Model Colony, Shivajinagar, Pune','901234567906','Lung','Urgent',81.50,'2025-12-10',324270102,'Waiting',NULL,0,'Dr. Smita Patil','Idiopathic Pulmonary Fibrosis (IPF)'),(625270018,'Sunita Eknath Bhosale','1969-08-05','Female','A-','+91-9823000009','sunita.b@email.com','Flat 502, Pearl Residency, Hadapsar, Pune','901234567907','Cornea','Routine',38.00,'2025-12-12',324270103,'Waiting',NULL,0,'Dr. Nitin Kulkarni','Keratoconus'),(625270019,'Ganesh Pandurang Chavan','1987-12-22','Male','B-','+91-9823000010','ganesh.c@email.com','Villa 9, Royal Palms, Viman Nagar, Pune','901234567908','Pancreas','Urgent',71.00,'2025-12-15',324270102,'Waiting',NULL,0,'Dr. Priya Ranade','Type 1 Diabetes Mellitus with Severe Complications'),(625270020,'Kavita Mohan Joshi','1996-03-17','Female','AB-','+91-9823000011','kavita.j@email.com','Flat 201, Sunshine Apts, Bavdhan, Pune','901234567909','Small Intestine','Urgent',65.00,'2025-12-18',324270101,'Waiting',NULL,0,'Dr. Anand Kelkar','Short Bowel Syndrome'),(625270021,'Sachin Tukaram Gaikwad','1974-05-09','Male','O+','+91-9823000012','sachin.g@email.com','Plot 10, Green Acres, Karve Nagar, Pune','901234567910','Kidney','Emergency',98.00,'2025-12-20',324270101,'Transplanted',NULL,0,'Dr. Suresh Joshi','Diabetic Nephropathy'),(625270022,'Meena Ashok Patil','1988-10-11','Female','A+','+91-9823000013','meena.p@email.com','B-102, Seasons Society, Pimple Saudagar, Pune','901234567911','Kidney','Urgent',69.00,'2025-12-22',324270102,'Waiting',NULL,1,'Dr. Priya Ranade','Hypertensive Nephrosclerosis'),(625270023,'Deepak Vilas Mane','1981-01-29','Male','B+','+91-9823000014','deepak.m@email.com','77, MG Road, Camp, Pune','901234567912','Liver','Critical',87.00,'2025-12-24',324270102,'Waiting',NULL,0,'Dr. Anand Kelkar','Decompensated Cirrhosis (NASH)'),(625270024,'Aarti Rajesh Deshmukh','1994-07-03','Female','O+','+91-9823000015','aarti.d@email.com','Flat 104, Choice Paradise, Kalyani Nagar, Pune','901234567913','Heart','Critical',91.00,'2025-12-28',324270103,'Waiting',NULL,0,'Dr. Rajesh Deshmukh','Dilated Cardiomyopathy'),(625270025,'Sanjay Vishnu Thorat','1971-11-14','Male','O-','+91-9823000016','sanjay.t@email.com','House 12, Tilak Road, Sadashiv Peth, Pune','901234567914','Kidney','Routine',46.00,'2026-01-02',324270101,'Waiting',NULL,0,'Dr. Suresh Joshi','Chronic Glomerulonephritis'),(625270026,'Pooja Dnyaneshwar Wagh','1991-04-20','Female','A-','+91-9823000017','pooja.w@email.com','C-304, Heritage Towers, Baner, Pune','901234567915','Lung','Urgent',76.00,'2026-01-05',324270101,'Waiting',NULL,0,'Dr. Smita Patil','Idiopathic Pulmonary Fibrosis (IPF)'),(625270027,'Pravin Mahadev Jagtap','1983-09-08','Male','B-','+91-9823000018','pravin.j@email.com','Plot 5, Sunrise Towers, Wakad, Pune','901234567916','Cornea','Routine',41.50,'2026-01-08',324270103,'Waiting',NULL,0,'Dr. Nitin Kulkarni','Keratoconus'),(625270028,'Varsha Sambhaji Salunkhe','1997-12-01','Female','AB+','+91-9823000019','varsha.s@email.com','Flat 601, Sea Crest Enclave, Kothrud, Pune','901234567917','Kidney','Emergency',99.00,'2026-01-10',324270101,'Transplanted',NULL,0,'Dr. Suresh Joshi','End-Stage Renal Disease (ESRD)'),(625270029,'Nitin Subhash Mohite','1979-06-16','Male','A+','+91-9823000020','nitin.m@email.com','14, Nanded City, Sinhagad Road, Pune','901234567918','Pancreas','Urgent',64.00,'2026-01-12',324270102,'Waiting',NULL,0,'Dr. Priya Ranade','Type 1 Diabetes Mellitus with Severe Complications'),(625270030,'Usha Chandrakant Kale','1986-02-28','Female','O+','+91-9823000021','usha.k@email.com','Flat 11, Orchid Towers, Aundh, Pune','901234567919','Kidney','Urgent',72.00,'2026-01-15',324270102,'Waiting',NULL,1,'Dr. Priya Ranade','Acute Kidney Injury on Chronic Renal Failure'),(625270031,'Rahul Eknath Chavan','1992-05-19','Male','B+','+91-9823000022','rahul.c@email.com','Bungalow 3, Royal Palms, Koregaon Park, Pune','901234567920','Liver','Critical',89.00,'2026-01-18',324270102,'Allocated',NULL,0,'Dr. Anand Kelkar','Decompensated Cirrhosis (NASH)'),(625270032,'Swati Balasaheb Kadam','1984-10-30','Female','AB-','+91-9823000023','swati.k@email.com','Flat 203, Rose Residency, Hadapsar, Pune','901234567921','Kidney','Routine',43.00,'2026-01-20',324270103,'Waiting',NULL,0,'Dr. Suresh Joshi','Polycystic Kidney Disease (PKD)');
/*!40000 ALTER TABLE `recipient` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_0900_ai_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER `trg_AuditRecipientStatusChange` AFTER UPDATE ON `recipient` FOR EACH ROW BEGIN
    -- Only log if the operational status actually changed
    IF OLD.RecipientStatus <> NEW.RecipientStatus THEN
        INSERT INTO recipient_status_audit (
            Recipient_ID, 
            Previous_Status, 
            New_Status, 
            Modified_Timestamp, 
            Action_Source
        ) VALUES (
            NEW.Recipient_ID, 
            OLD.RecipientStatus, 
            NEW.RecipientStatus, 
            NOW(),
            USER()
        );
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
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
