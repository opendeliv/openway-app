import React, { useState } from 'react';
import {
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

const BLUE = '#1F6FE5';
const BLUE_LIGHT = '#EAF2FF';
const BG = '#F4F7FB';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';

const SUPPORT_EMAIL = 'raptrrapp@gmail.com';
const LAST_UPDATED = '14 November 2026';

type Lang = 'en' | 'hi';
type Section = { title: string; body: string[] };

type Content = {
  headerTitle: string;
  introTitle: string;
  updatedLabel: string;
  lead: string;
  policySections: Section[];
  groupTitle: string;
  conductSections: Section[];
  contactTitle: string;
  contactText: string;
  button: string;
};

/* =========================================================
   CONTENT (English + Hinglish)
   ========================================================= */

const CONTENT: Record<Lang, Content> = {
  /* ------------------------- ENGLISH ------------------------- */
  en: {
    headerTitle: 'Privacy Policy',
    introTitle: 'Your privacy matters',
    updatedLabel: 'Last updated',
    lead:
      'This policy explains what information we collect from captains, how we use it and how we keep it safe. It also lists the rules every captain must follow.',
    policySections: [
      {
        title: '1. Information we collect',
        body: [
          'Personal details: your name, mobile number and email address.',
          'Vehicle details: vehicle type, category, number, model and color.',
          'Documents: photo and number of your Aadhaar card and Driving License.',
          'Location data: your live location while you are online as a captain, to match you with rides and deliveries.',
          'Device and usage data: device model, app version and basic usage logs for security and improvement.',
        ],
      },
      {
        title: '2. How we use your information',
        body: [
          'To verify your identity and documents before you can take rides.',
          'To match you with customers, show your trips and process your earnings.',
          'To contact you about your account, trips, safety and support requests.',
          'To prevent fraud, misuse and to follow legal requirements.',
        ],
      },
      {
        title: '3. Sharing of information',
        body: [
          'Customers can see your name, vehicle details and live location during an active trip.',
          'We may share data with service providers (verification, hosting, SMS) who work for us under confidentiality.',
          'We may share data with authorities when required by law.',
          'We do not sell your personal information.',
        ],
      },
      {
        title: '4. Documents & verification',
        body: [
          'Your Aadhaar and license are used only for captain verification.',
          'Documents are stored securely and are visible only to authorised verification staff.',
        ],
      },
      {
        title: '5. Data security',
        body: [
          'We use reasonable technical and organisational measures to protect your data.',
          'No system is 100% secure, so please keep your account details private.',
        ],
      },
      {
        title: '6. Data retention',
        body: [
          'We keep your data while your captain account is active and for the period needed for legal, tax and safety purposes.',
          'After that, data is deleted or anonymised.',
        ],
      },
      {
        title: '7. Your rights',
        body: [
          'You can view and update your profile details in the app.',
          'You can request correction or deletion of your data by contacting support.',
          'You can withdraw consent, but then we may not be able to continue your captain account.',
        ],
      },
      {
        title: '8. Changes to this policy',
        body: [
          'We may update this policy from time to time. Important changes will be shown in the app.',
        ],
      },
    ],
    groupTitle: 'Captain Rules & Code of Conduct',
    conductSections: [
      {
        title: '9. Ride rules for captains',
        body: [
          'Accept a ride only when you are ready to complete it. Do not cancel again and again without a genuine reason.',
          'Reach the pickup point on time and follow the route shown in the app.',
          'Start the ride only after the correct customer is in the vehicle. Verify the ride code or details if the app asks for it.',
          'Do not take extra passengers, extra goods or extra stops that are not part of the booking.',
          'Do not ask for extra money. Charge only the fare shown in the app (plus tolls or waiting charges if the app shows them).',
          'Follow all traffic rules. Do not use the phone while driving, do not overspeed and do not drive after alcohol or drugs.',
          'Wear a helmet (bike) or seat belt (cab) and make sure your customer is also safe.',
          'Keep your vehicle clean, in good condition, with valid insurance, RC and fitness papers.',
          'End the ride in the app only after reaching the destination.',
        ],
      },
      {
        title: '10. Behaviour with customers and others',
        body: [
          'Always speak politely and respectfully with customers, other captains, shopkeepers and our support team.',
          'Do not abuse, threaten, harass or fight with anyone. Do not discriminate on the basis of gender, religion, caste, region or language.',
          'Any kind of misbehaviour, unwanted touching, staring, inappropriate comments or messages to a customer is strictly not allowed.',
          "Do not misuse a customer's phone number, address or location. Do not call or message them after the trip for personal reasons.",
          'Do not argue over cancellations or payments. Contact support in the app instead.',
          'Complaints of misbehaviour will be investigated. Your account can be suspended or permanently blocked, and serious cases can be reported to the police.',
        ],
      },
      {
        title: '11. Order confirmation with the user',
        body: [
          'Before starting any ride or delivery, confirm the order details with the user: pickup point, drop point, type of service and fare.',
          'For parcel or goods orders, confirm what is being sent, how many items and who will receive it.',
          'Take the OTP or confirmation from the user at pickup and at delivery whenever the app asks for it. Never share or ask for the OTP outside the app.',
          'If the user wants any change in the pickup, drop or items, ask them to update it in the app. Do not accept changes verbally.',
          'If the details are wrong, the user is not reachable or the order looks suspicious, do not start the trip. Cancel it in the app and inform support.',
          'Do not mark an order as picked up or delivered before it really is.',
        ],
      },
      {
        title: "12. Parcel delivery: responsibilities of the sender",
        body: [
          "Give correct and complete details: item description, pickup address, drop address, and the receiver's name and phone number. Wrong details are the sender's responsibility.",
          "Pack the parcel properly so that it does not break, leak or open during travel. Fragile, liquid or valuable items must be packed with extra care and marked clearly.",
          "Do not send illegal, dangerous or restricted items such as drugs, weapons, explosives, flammable or hazardous goods, stolen goods, live animals, large amounts of cash or anything banned by law. The sender is fully responsible for any such item and for the legal consequences.",
          "Declare the correct value of the parcel if the app asks for it. Very valuable items (jewellery, cash, important original documents) are sent at the sender's own risk unless the app clearly allows them.",
          "Stay reachable on phone at pickup time, and inform the receiver about the delivery so that they are available.",
          "Pay only the fare shown in the app. Do not ask the captain to carry extra parcels or make extra stops outside the app booking.",
          "Keep all communication and payment inside the app. Do not settle anything privately with the captain.",
        ],
      },
      {
        title: "13. Parcel delivery: responsibilities of the captain",
        body: [
          "At pickup, check that the parcel is properly packed, matches the description and the number of items given by the sender. Take a pickup photo if the app asks.",
          "If the parcel looks unsafe, badly packed, open, suspicious or is a prohibited item, refuse it, cancel in the app and inform support. Do not take it.",
          "Confirm the receiver's name, phone number and drop address with the sender, and take the pickup OTP or confirmation whenever the app asks.",
          "Do not open, damage, use, keep, swap, sell or tamper with any parcel. Do not read or share the contents or the personal details of the sender or receiver.",
          "Keep the parcel safe and dry, use a bag or box if needed, and do not leave it unattended, even for a short time. Do not make personal stops with the parcel.",
          "Do not hand the parcel to anyone other than the receiver named in the order (or a person the receiver has clearly authorised). Never hand it over without the delivery OTP or confirmation.",
          "Take a clear delivery photo if the app asks. If the receiver cannot be verified or is not reachable, do not leave the parcel anywhere. Contact support and wait for instructions.",
          "For cash on delivery (COD) orders, collect the exact amount shown in the app and submit it as per company rules. Do not take extra money.",
          "If any problem happens on the way (accident, breakdown, puncture, wrong address, receiver not reachable, parcel damaged), inform support and the sender immediately, keep the parcel safe, and do not decide on your own.",
          "Do not return the parcel to the sender or hand it to anyone else unless the app or support tells you to.",
        ],
      },
      {
        title: "14. Parcel delivery: responsibilities of the receiver",
        body: [
          "Keep your phone reachable and be available at the drop address at delivery time. Give correct directions to the captain.",
          "Check the parcel in front of the captain (outer packing, seal, number of items) before giving the delivery OTP.",
          "If the parcel is open, damaged or looks tampered with, do not give the OTP. Tell the captain and report in the app immediately with photos.",
          "Share the delivery OTP only with the captain, only at the time of actual handover and only after seeing the parcel. Never share it on call or message with anyone else.",
          "Do not refuse a parcel without a genuine reason. If the receiver refuses, is not available or gives a wrong address, the sender may have to pay extra waiting or return charges.",
          "Once the receiver gives the OTP and accepts the parcel, the delivery is treated as complete. A later claim for damage can be accepted only for hidden damage, reported within 24 hours (or the time shown in the app) with proof.",
          "Behave politely with the captain. Abuse or threats can lead to action against your account.",
        ],
      },
      {
        title: "15. Lost, damaged or undelivered parcels",
        body: [
          "If a parcel is lost, damaged, stolen, delivered to a wrong person or not delivered, the sender, receiver or captain must report it in the app support immediately, with the order ID and photos if available.",
          "If the loss or damage happened because of the captain's negligence, carelessness, misconduct or fraud, the captain is responsible. The company can recover the amount from the captain's earnings or pending payments, suspend or permanently block the account, and take legal action. Any compensation to the sender is decided as per company policy.",
          "If the problem happened because of the sender (wrong details, poor packing, wrong value, prohibited item, not reachable at pickup), the sender is responsible. No compensation will be given and the sender is responsible for any fine or legal consequence.",
          "If the problem happened because of the receiver (refusing without reason, not available, wrong address, wrong person taking the parcel because of shared OTP), the receiver and sender are responsible, and extra waiting or return charges may apply.",
          "If the problem happened due to reasons beyond anyone's control (an accident not caused by the captain, natural disaster, strike, seizure by authorities), the case will be checked individually and a fair decision will be taken.",
          "Compensation, if any, is decided only after investigation and proof. It is limited to the declared value of the item or the maximum limit shown in the app, whichever is lower. Cash, jewellery and other very valuable items are not covered unless the app clearly says so.",
        ],
      },
      {
        title: "16. Role of the app",
        body: [
          "The app is a technology platform that connects senders, captains and receivers. It provides tools such as booking, tracking, OTP, photos and support. The app does not itself carry or handle the parcel.",
          "When a complaint comes, the app will check the available records (trip and location data, OTPs, photos, calls or chat in the app) and try to resolve the matter fairly.",
          "The app may take action on any account (warning, suspension, block, withholding payments) if a rule is broken by a sender, captain or receiver.",
          "To the extent allowed by law, the app is not responsible for loss or damage caused by the sender, captain, receiver or any third party. Nothing in this policy takes away any right you have under Indian law, including consumer protection law.",
        ],
      },
      {
        title: "17. Complaints and dispute process",
        body: [
          "Raise your complaint in the app support or by email within 24 hours of the delivery (or the expected delivery time), with the order ID, photos and a short description.",
          "Both sides may be asked for proof. Please cooperate and share true information.",
          "Do not settle anything privately or in cash outside the app. Claims without app records may not be accepted.",
          "False or fake complaints, fake photos and fraud can lead to account suspension and legal action.",
          "The app will give a decision in a reasonable time. You can write to us at the email given at the end of this page.",
        ],
      },
      {
        title: '18. Action for rule violations',
        body: [
          'Breaking these rules can lead to a warning, temporary suspension, permanent removal from the app, withholding of payments for damages and legal action.',
          'You are responsible for any loss caused by your negligence, misuse or fraud.',
        ],
      },
    ],
    contactTitle: '19. Contact us',
    contactText:
      'For any question about this policy or these rules, write to us at:',
    button: 'I Understand',
  },

  /* ------------------------- HINGLISH ------------------------- */
  hi: {
    headerTitle: 'Privacy Policy',
    introTitle: 'Aapki privacy hamare liye important hai',
    updatedLabel: 'Last updated',
    lead:
      'Ye policy batati hai ki hum captains se kaun si information lete hain, uska use kaise karte hain aur use surakshit kaise rakhte hain. Isme wo rules bhi hain jo har captain ko follow karne hain.',
    policySections: [
      {
        title: '1. Hum kaun si information lete hain',
        body: [
          'Personal details: aapka naam, mobile number aur email address.',
          'Vehicle details: vehicle type, category, number, model aur color.',
          'Documents: aapke Aadhaar card aur Driving License ki photo aur number.',
          'Location data: jab aap captain ke roop mein online hote ho tab aapki live location, taaki aapko rides aur deliveries mil sakein.',
          'Device aur usage data: device model, app version aur basic usage logs, security aur improvement ke liye.',
        ],
      },
      {
        title: '2. Hum aapki information ka use kaise karte hain',
        body: [
          'Rides lene se pehle aapki identity aur documents verify karne ke liye.',
          'Aapko customers se match karne, aapke trips dikhane aur earnings process karne ke liye.',
          'Aapke account, trips, safety aur support requests ke baare mein aapse contact karne ke liye.',
          'Fraud aur misuse rokne aur kanooni zarooraton ko follow karne ke liye.',
        ],
      },
      {
        title: '3. Information share karna',
        body: [
          'Active trip ke dauran customer aapka naam, vehicle details aur live location dekh sakta hai.',
          'Hum apne service providers (verification, hosting, SMS) ke saath data share kar sakte hain jo confidentiality ke saath hamare liye kaam karte hain.',
          'Kanoon ke anusaar zarurat padne par hum authorities ke saath data share kar sakte hain.',
          'Hum aapki personal information bechte nahi hain.',
        ],
      },
      {
        title: '4. Documents aur verification',
        body: [
          'Aapka Aadhaar aur license sirf captain verification ke liye use hota hai.',
          'Documents surakshit store kiye jaate hain aur sirf authorised verification staff hi dekh sakta hai.',
        ],
      },
      {
        title: '5. Data security',
        body: [
          'Hum aapke data ki suraksha ke liye uchit technical aur organisational upay karte hain.',
          'Koi bhi system 100% secure nahi hota, isliye apne account ki details private rakhein.',
        ],
      },
      {
        title: '6. Data kitne time tak rakha jata hai',
        body: [
          'Jab tak aapka captain account active hai aur kanooni, tax aur safety ke liye jitna time zaruri hai, tab tak hum aapka data rakhte hain.',
          'Uske baad data delete ya anonymise kar diya jata hai.',
        ],
      },
      {
        title: '7. Aapke adhikaar',
        body: [
          'Aap app mein apni profile details dekh aur update kar sakte ho.',
          'Aap support se contact karke apne data mein correction ya deletion ki request kar sakte ho.',
          'Aap apni consent wapas le sakte ho, lekin tab hum aapka captain account jaari nahi rakh payenge.',
        ],
      },
      {
        title: '8. Policy mein badlav',
        body: [
          'Hum samay-samay par is policy ko update kar sakte hain. Zaruri badlav app mein dikhaye jayenge.',
        ],
      },
    ],
    groupTitle: 'Captain ke Rules aur Code of Conduct',
    conductSections: [
      {
        title: '9. Captain ke liye ride rules',
        body: [
          'Ride tabhi accept karo jab aap use poora karne ke liye ready ho. Bina sahi wajah ke baar-baar cancel mat karo.',
          'Pickup point par time par pahucho aur app mein dikhaye gaye route ko follow karo.',
          'Ride tabhi start karo jab sahi customer gaadi mein baith jaye. Agar app maange to ride code ya details verify karo.',
          'Booking ke bahar ke extra passenger, extra saaman ya extra stop mat lo.',
          'Extra paise mat maango. Sirf wahi fare lo jo app mein dikh raha hai (toll ya waiting charges bhi tabhi jab app dikhaye).',
          'Traffic rules follow karo. Gaadi chalate time phone use mat karo, overspeed mat karo aur sharab ya nashe mein gaadi mat chalao.',
          'Helmet (bike) ya seat belt (cab) pehno aur dhyan rakho ki aapka customer bhi surakshit rahe.',
          'Apni gaadi saaf aur achhi condition mein rakho, valid insurance, RC aur fitness papers ke saath.',
          'Ride ko app mein tabhi end karo jab destination par pahuch jao.',
        ],
      },
      {
        title: '10. Customers aur dusron ke saath behaviour',
        body: [
          'Customers, dusre captains, dukaandaaron aur hamari support team se hamesha vinamrata aur izzat se baat karo.',
          'Kisi ko gaali, dhamki, pareshaan ya jhagda mat karo. Gender, dharm, jaati, ilaake ya bhasha ke aadhar par bhedbhav mat karo.',
          'Customer ke saath kisi bhi tarah ki badtameezi, galat tareeke se chhoona, ghurna, galat comments ya messages bilkul allowed nahi hain.',
          'Customer ke phone number, address ya location ka misuse mat karo. Trip ke baad personal wajah se unhe call ya message mat karo.',
          'Cancellation ya payment par behes mat karo. Iske liye app mein support se contact karo.',
          'Badtameezi ki complaint ki jaanch hogi. Aapka account suspend ya hamesha ke liye block ho sakta hai aur gambhir cases police ko report kiye ja sakte hain.',
        ],
      },
      {
        title: '11. User se order confirm karwana',
        body: [
          'Koi bhi ride ya delivery start karne se pehle user ke saath order ki details confirm karo: pickup point, drop point, service ka type aur fare.',
          'Parcel ya goods ke order mein confirm karo ki kya bheja ja raha hai, kitne items hain aur receive kaun karega.',
          'Jab bhi app maange, pickup aur delivery par user se OTP ya confirmation lo. OTP ko app ke bahar kabhi share mat karo aur na hi maango.',
          'Agar user pickup, drop ya items mein koi badlav chahta hai to use app mein update karne ko bolo. Sirf bol kar badlav accept mat karo.',
          'Agar details galat hain, user se baat nahi ho pa rahi hai ya order shak wala lag raha hai to trip start mat karo. App mein cancel karo aur support ko batao.',
          'Order ko picked up ya delivered tabhi mark karo jab sach mein ho gaya ho.',
        ],
      },
      {
        title: "12. Parcel delivery: sender ki zimmedaari",
        body: [
          "Sahi aur poori details do: item ka description, pickup address, drop address aur receiver ka naam aur phone number. Galat details ki zimmedaari sender ki hogi.",
          "Parcel ko achhe se pack karo taaki wo safar mein toote nahi, leak na ho aur khule nahi. Nazuk, liquid ya keemti cheezon ko extra dhyan se pack karo aur saaf likh do.",
          "Gair-kanooni, khatarnak ya restricted cheezein mat bhejo, jaise nashili cheezein, hathiyaar, vishfotak, jwalansheel ya khatarnak saaman, chori ka maal, zinda janwar, bahut zyada cash ya kanoon se banned koi bhi cheez. Aisi kisi bhi cheez aur uske kanooni nateejon ki poori zimmedaari sender ki hogi.",
          "Agar app maange to parcel ki sahi value declare karo. Bahut keemti cheezein (gehne, cash, zaruri original documents) sender ke apne risk par bheji jaati hain, jab tak app saaf taur par allow na kare.",
          "Pickup ke time phone par available raho aur receiver ko delivery ke baare mein bata do taaki wo maujood rahe.",
          "Sirf wahi fare do jo app mein dikh raha hai. Captain se app booking ke bahar extra parcel ya extra stop ke liye mat bolo.",
          "Saari baat-cheet aur payment app ke andar hi rakho. Captain ke saath kuch bhi private mein settle mat karo.",
        ],
      },
      {
        title: "13. Parcel delivery: captain ki zimmedaari",
        body: [
          "Pickup par check karo ki parcel sahi se pack hai aur sender ke diye description aur items ki ginti se match karta hai. Agar app maange to pickup ki photo lo.",
          "Agar parcel unsafe, kharab pack, khula hua, shak wala ya prohibited item lage to mana kar do, app mein cancel karo aur support ko batao. Wo parcel mat lo.",
          "Sender se receiver ka naam, phone number aur drop address confirm karo, aur jab bhi app maange pickup OTP ya confirmation lo.",
          "Kisi bhi parcel ko kholo mat, kharab mat karo, use mat karo, rakho mat, badlo mat, becho mat aur ched-chhaad mat karo. Andar ke saaman ya sender aur receiver ki personal details ko padho mat aur kisi se share mat karo.",
          "Parcel ko surakshit aur sookha rakho, zarurat ho to bag ya box use karo, aur ek pal ke liye bhi akela mat chhodo. Parcel ke saath personal stop mat karo.",
          "Parcel order mein diye gaye receiver ke alawa kisi ko mat do (ya us vyakti ko jise receiver ne saaf taur par authorise kiya ho). Delivery OTP ya confirmation ke bina kabhi mat do.",
          "Agar app maange to delivery ki saaf photo lo. Agar receiver verify nahi ho pa raha ya baat nahi ho pa rahi to parcel kahin mat chhodo. Support se contact karo aur instructions ka wait karo.",
          "Cash on delivery (COD) orders mein app mein dikhaya gaya exact amount lo aur company ke rules ke hisaab se jama karo. Extra paise mat lo.",
          "Agar raaste mein koi problem ho (accident, gaadi kharab, puncture, galat address, receiver se baat nahi, parcel kharab), to turant support aur sender ko batao, parcel ko surakshit rakho aur apne se faisla mat lo.",
          "Parcel ko sender ko wapas mat do aur kisi aur ko mat do, jab tak app ya support na bole.",
        ],
      },
      {
        title: "14. Parcel delivery: receiver ki zimmedaari",
        body: [
          "Apna phone chalu rakho aur delivery ke time drop address par maujood raho. Captain ko sahi raasta batao.",
          "Delivery OTP dene se pehle captain ke saamne parcel check karo (bahar ki packing, seal, items ki ginti).",
          "Agar parcel khula hai, kharab hai ya ched-chhaad hui lagti hai to OTP mat do. Captain ko batao aur turant photos ke saath app mein report karo.",
          "Delivery OTP sirf captain ko do, sirf asli handover ke time aur parcel dekhne ke baad. Call ya message par kisi aur ko kabhi share mat karo.",
          "Bina sahi wajah ke parcel lene se mana mat karo. Agar receiver mana kare, available na ho ya galat address de to sender ko extra waiting ya return charges dene pad sakte hain.",
          "Jab receiver OTP de de aur parcel le le, to delivery poori maani jaayegi. Baad mein damage ka claim sirf chhupe hue damage ke liye hi maana ja sakta hai, jo 24 ghante ke andar (ya app mein dikhaye time ke andar) proof ke saath report kiya gaya ho.",
          "Captain ke saath vinamrata se pesh aao. Gaali ya dhamki dene par aapke account par karwai ho sakti hai.",
        ],
      },
      {
        title: "15. Parcel kho jaye, kharab ho jaye ya deliver na ho",
        body: [
          "Agar parcel kho jaye, kharab ho jaye, chori ho jaye, galat vyakti ko chala jaye ya deliver na ho, to sender, receiver ya captain ko turant app support mein order ID aur (agar ho to) photos ke saath report karna hoga.",
          "Agar nuksan captain ki laaparwahi, lapravahi, badtameezi ya fraud ki wajah se hua hai, to captain zimmedar hoga. Company wo amount captain ki earnings ya pending payments se kaat sakti hai, account suspend ya hamesha ke liye block kar sakti hai aur kanooni karwai kar sakti hai. Sender ko koi compensation company ki policy ke hisaab se tay hoga.",
          "Agar problem sender ki wajah se hui (galat details, kharab packing, galat value, prohibited item, pickup par available nahi), to sender zimmedar hoga. Koi compensation nahi milega aur kisi bhi jurmaane ya kanooni nateeje ka zimmedar sender hoga.",
          "Agar problem receiver ki wajah se hui (bina wajah mana karna, available na hona, galat address, OTP share karne ki wajah se galat vyakti ka parcel le jaana), to receiver aur sender zimmedar honge aur extra waiting ya return charges lag sakte hain.",
          "Agar problem kisi ke control ke bahar wajah se hui (captain ki galti ke bina accident, prakritik aapda, hadtal, authorities dwara zabt), to case alag se check hoga aur nyayochit faisla liya jayega.",
          "Compensation, agar mile, to sirf jaanch aur proof ke baad tay hota hai. Wo item ki declared value ya app mein dikhayi gayi maximum limit, jo bhi kam ho, tak seemit hai. Cash, gehne aur dusri bahut keemti cheezein tab tak cover nahi hoti jab tak app saaf na bole.",
        ],
      },
      {
        title: "16. App ki bhumika",
        body: [
          "App ek technology platform hai jo sender, captain aur receiver ko jodta hai. Ye booking, tracking, OTP, photos aur support jaise tools deta hai. App khud parcel ko le jaata ya sambhalta nahi hai.",
          "Jab complaint aati hai to app uplabdh records (trip aur location data, OTP, photos, app mein call ya chat) check karega aur maamle ko nishpaksh tareeke se suljhane ki koshish karega.",
          "Agar sender, captain ya receiver koi rule todta hai to app us account par karwai kar sakta hai (warning, suspension, block, payment rokna).",
          "Kanoon jitni ijaazat deta hai utne tak, app sender, captain, receiver ya kisi teesre vyakti ki wajah se hue nuksan ka zimmedar nahi hai. Is policy mein kuch bhi Indian kanoon (consumer protection kanoon samet) ke tahat aapke adhikaar nahi chheenta.",
        ],
      },
      {
        title: "17. Complaint aur vivad suljhane ki process",
        body: [
          "Delivery ke 24 ghante ke andar (ya expected delivery time ke baad) app support mein ya email se order ID, photos aur chhote description ke saath complaint karo.",
          "Dono pakshon se proof maanga ja sakta hai. Kripya sahyog karo aur sach jaankari do.",
          "App ke bahar private ya cash mein kuch settle mat karo. App ke records ke bina kiye gaye claim maane nahi ja sakte.",
          "Jhooti ya nakli complaint, nakli photos aur fraud par account suspend ho sakta hai aur kanooni karwai ho sakti hai.",
          "App ek uchit samay mein faisla dega. Aap is page ke ant mein diye gaye email par humein likh sakte ho.",
        ],
      },
      {
        title: '18. Rules todne par karwai',
        body: [
          'In rules ko todne par warning, temporary suspension, app se hamesha ke liye hatana, nuksan ke liye payment rokna aur kanooni karwai ho sakti hai.',
          'Aapki laaparwahi, misuse ya fraud se hue kisi bhi nuksan ke zimmedar aap honge.',
        ],
      },
    ],
    contactTitle: '19. Humse sampark karein',
    contactText:
      'Is policy ya in rules ke baare mein koi sawal ho to humein is email par likhein:',
    button: 'Samajh gaya',
  },
};

/* =========================================================
   SCREEN
   ========================================================= */

export default function PrivacyPolicyScreen() {
  const navigation = useNavigation();
  const [lang, setLang] = useState<Lang>('en');
  const t = CONTENT[lang];

  const renderSection = (s: Section) => (
    <View key={s.title} style={styles.card}>
      <Text style={styles.sectionTitle}>{s.title}</Text>
      {s.body.map((line, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.bodyText}>{line}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.headerTitle}</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Language toggle */}
      <View style={styles.langBar}>
        <View style={styles.langWrap}>
          <TouchableOpacity
            style={[styles.langBtn, lang === 'en' && styles.langBtnOn]}
            activeOpacity={0.85}
            onPress={() => setLang('en')}
          >
            <Text style={[styles.langText, lang === 'en' && styles.langTextOn]}>
              English
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.langBtn, lang === 'hi' && styles.langBtnOn]}
            activeOpacity={0.85}
            onPress={() => setLang('hi')}
          >
            <Text style={[styles.langText, lang === 'hi' && styles.langTextOn]}>
              Hinglish
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={styles.introEmoji}>🔒</Text>
          <Text style={styles.introTitle}>{t.introTitle}</Text>
          <Text style={styles.introSub}>
            {t.updatedLabel}: {LAST_UPDATED}
          </Text>
        </View>

        <Text style={styles.lead}>{t.lead}</Text>

        {t.policySections.map(renderSection)}

        <Text style={styles.groupTitle}>{t.groupTitle}</Text>

        {t.conductSections.map(renderSection)}

        {/* Contact */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t.contactTitle}</Text>
          <Text style={styles.bodyText}>{t.contactText}</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          >
            <Text style={styles.email}>{SUPPORT_EMAIL}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.btn}
          activeOpacity={0.9}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.btnText}>{t.button}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { padding: 16, paddingBottom: 24 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 24, color: BLUE, fontWeight: '700' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: BLACK },

  // language toggle
  langBar: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  langWrap: {
    flexDirection: 'row',
    backgroundColor: BG,
    borderRadius: 12,
    padding: 4,
  },
  langBtn: {
    flex: 1,
    height: 38,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langBtnOn: { backgroundColor: BLUE },
  langText: { fontSize: 14, fontWeight: '700', color: GREY },
  langTextOn: { color: '#fff' },

  intro: { alignItems: 'center', marginBottom: 14, marginTop: 4 },
  introEmoji: { fontSize: 44, marginBottom: 8 },
  introTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: BLACK,
    textAlign: 'center',
  },
  introSub: { fontSize: 12.5, color: GREY, marginTop: 4 },

  lead: {
    fontSize: 13.5,
    color: BLACK,
    lineHeight: 20,
    backgroundColor: BLUE_LIGHT,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },

  groupTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: BLUE,
    marginTop: 8,
    marginBottom: 12,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: BLACK, marginBottom: 10 },
  bulletRow: { flexDirection: 'row', marginBottom: 6 },
  bullet: { fontSize: 14, color: BLUE, marginRight: 8, lineHeight: 20 },
  bodyText: { flex: 1, fontSize: 13.5, color: GREY, lineHeight: 20 },
  email: {
    fontSize: 14.5,
    fontWeight: '700',
    color: BLUE,
    textDecorationLine: 'underline',
    marginTop: 8,
  },

  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  btn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});