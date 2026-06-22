import pool from './config/db.js';

const rawData = `NAME 	PHONE NUMBER 	address
Hari Om Caterings	9035558246	Hospet Caterings
H A Caterings (Manjunath)	9946558774	Hospet
K N Caterings (Naveen Kumar)	9071290011	Hospet
Appu Caterings (Lohith	9535841371	Hospet
Seema Caterings (Seema.p)	8050352246	Hospet
C.P. Caterings (C .P .Manjunath)	9480000892	Hospet
Kasturi Caterings ( Kasturi Lakshmi)	8073667756	Hospet
Anasuya Caterings  (Anasuya)	8147996798	
Rajanna Caterings	9035584708	Hospet
Rajanna Caterings	9035584708	Hospet
Venkatesh Caterings( Venkatesh  Marvadi )	8431009875	Hospet
M.S. Caterings (M.S. Nagaraj)	9980717578	Hospet
Mansali Caterings (Manasali venkatesh)	9880084340	Hospet
Kittappa Caterings ( S. N .Murali  Krishna )	8197862820	Hospet
Sanjeev Caterings (K. Sanjeev Rao )	9483283974	Hospet
Raghunath Caterings (B.K.Raghunath)	9845846949	
Raghunath Caterings (B.K.Raghunath)	9845846949	
Narayan Caterings( NaryanRao Huligeri)	9611694115	
GuruRaj Caterings(K GuruRaj)	9880447423	Hospet
GuruRaj Caterings(K GuruRaj)	9880447423	Hospet
Dattateya Caterings(Dattatre Sanganala )	9663661935	Hospet
Vanishree Caterings (Vanishree Sanganal)	8197430769	
Shailaja Caterings(Shailaja Gangavathi)	9740259078	Hospet
Ravi Caterings(Ravi Deshpande)	9945022987	Hospet
Madeva Caterings(K.Madav Rao)	9880060597	Hospet
Shridhar Caterings ( H  A Shridhar )	9886102236	Hospet
Vardaraj  Caterings	9886102236	Hospet
Bhagamma Caterings (Bhagyammasangnal)	8904229430	Hospet
Sri Devi Caterings (Sridevi)	9741803867	Hospet
Kamala Caterings (Kamala Caterings)	8147308860	Hospet
Deep Caterings ( Deep Chitwadigi)	9741511391	Hospet
Bhimasena Caterngs (M.Bhimasena)	9448795106	Hospet
Anand Caterings(Anand musagal)	9663107291	Hospet
Guraj Caterings (Guraj Katti )	8618464300	Hospet
Nagaraj Caterings (Nagaraj kamlmangi)	8618199187	Hospet
Sudhindra Catrings(H.k.Sudhindra )	9945199689	Hospet
Anil Caterings(R Anil)	9740452954	Hospet
Praveen Caterings (Preveen .S)	8904503230	Hospet
Yalaguresh Caterings (R Yalaguresh)	9606582602	Hospet
Sathish  Caterings(Sathish Vadappi)	9008539045	Hospet
Pradeep Caterings(Pradeep Patil)	8296755169	Hospet
Prasanna Caterings (Prasanna  Keruru)	7996240174	Hospet
Karanam Caterings(Niranjana Karanam )	8050347870	
Raghvendra Caterings (Raghavendra)	6361063690	Hospet
Raghvendra Caterings (Raghavendra)	6361063690	Hospet
Hanumantha Caterings(Habumantha Rao)	9742160715	Hospet
Naryan Caterings (Narayana Ambeka)	8073295726	Hospet
Kirloskar Caterings (S Sathyanaryana)	9632413552	Hospet
Ramu Caterings(Sri Ramu Panty)	6361257796	Hospet
Jaganath Caterings( Jaghanath Sanghanal)	8123872295	Hospet
Pandu Caterings(Sri .Pandu Kote)	9886001855	Hospet
Ramu Caterings(Megeri Ramu Rao )	9449171683	Hospet
Appana Caterings(Narasimhamurthy)	9448128728	Hospet
Prabu Caterings (M N Prabhuram Rao)	9443652259	Hospet
Ramchari Caterings (T Ramachari)	9980445799	Hospet
Sathnaryan Caterings(R Sathyanaryan)	9945833297	Hospet
Swasthik Comercial	8722221787	Hospet
Nageshwara Rao Catering Gangavathi	9982652844	Hospet
Rajashkar Ginigeri	8762024756	Hospet
Maruthi	9448183776	Hospet
Shiva Naik	9113265019	Hospet
Cococola Mahammed	8951461119	Hospet
H.N.F :Iman	9448386771	Hospet
Prabhath Electricals	9844110144	Hospet
Ramdev Caterrings	9035062914	
Mallikarjuna  Caterings	9986107207	Hospet
Sandur Caterings	9945199689	Hospet
Tungabadra Caterings	9945953558	Hospet
Harihana Nagraj	9449250282	Hospet
Prabhu Caterings	9113652259	Hospet
Shiva Shakthi Caterings	9980425418	Hospet
Kalavathi Caterings	7411046216	Hospet
Rajshakar Hitnal	7676331913	Hospet
Anmol Caterings	9008166731	Hospet
Kushal Sing (Ballary)	7990013384	Hospet
Popular Supliery	9731530651	Hospet
Popular Supliery	9731530651	Hospet
Prabu Caterings	9448846244	Hospet
Prabu Caterings	9448846244	Hospet
Umpak	7411594915	Hospet
Manjunath Caterings	9986558774	Hospet
Punam Sing Catering	8660652033	Hospet
Annapurna Catering	9986001228	Hospet
Basheer Bige	9945599004	Hospet
Teppeswamy BDCC bank	9972518629	Hospet
Teppeswamy BDCC bank	9972518629	Hospet
Nagaraj Catering	8123688999	Hospet
Bhagavathi Catering Raichur	7406303132	Hospet
H.K.G. Catering Hospet	8660220233	Hospet
Anand ahar Hospet	9036201056	Hospet
Ananthapura Catring	9490611154	Hospet
Madura Milana Catring	9731187619	Hospet
Athmaram Takarum Catering	9972935524	Hospet
Bajarang Catring (Bellary)	8660652033	
G.P.venkatesh (Banglore)	9844035762	Hospet
Hanumanthappa Catering Sonram	9740728018	
Jaswanth Catering (Davangere)	9448275278	
Jaswanth Catering (Davangere)	9448275278	
Keerthana Catering	8019613496	
Mahesh Catering	8660021416	Hospet
Moti Singh Catering	8217340047	HOspet
N .H .50	9972222605	Hospet
Rakesh	7019847837	
Prdeep Catering (Thirthalli)	9448414864	
Prasad Catering (Ballary)	9845003288	
Ramdev Catering (kalu maharaj)	8618279152	
Ram Laxman Catering (Benglore)	8880005828	
Ramsing hari om catering blory	7019714700	
Roopdas  Catering Benglore	9036362707	
Samath Catring Davangere	9739665656	
Sathya Catering hpt	9342602524	
Sudindra Catering	9945199689	
Uday Catering	9902049733	
Anmol Catering Kuldep	7406146425	
Balaji Catering Gadag	9449262044	
Kolapura pappu  Catering	9035062914	
Davangere Catering Jain	9449828280	
Gopal Catering  Raichur	9739784405	
Hyderabad Catering	9603163355	
Mallikarjun Catering	9986127101	
Moti Singh Kushal Catring	8904003429	
Namgendra bj Celebration	9886529296	
Naveen Catering	7892123566	
Ravathi Catering Benglore	9844453615	
k s manjunath	9880002404	
sumanth km	8762165510	
nagaraj	1111111111	company dist
Siraj M M Halli	7204726738	M M Halli
Mahalakshmi Catering	9449945866	Akashavani Hospet
Rajesh	2222222222	Dam Road Hospet (Comany Distributor)
Khaja	3333333333	Ballry road Hospet (Company Distributor)
Siraj	4444444444	Hospet (Company Distributor)
Srinivas Huligi	5555555555	Huligi Distributor
Lokesh Hampi	6666666666	Hampi Distributor
Sadiq Basha	7777777777	Company Distributor
MANJU	8762528945	HOSAPETE
Gunnal	1010101010	Ishwari Agency Gunnal-8884006147
Bandri	2020202020	Basaveshwara Teli link Bandri-9886472749
M M Halli Anand	3030303030	Sri sai Cool Drink M M Halli-9008003947
M M Halli Siraj	4040404040	Siraj Enterprises M M Halli
H. B Halli Patrappa	6060606060	Vallabha enterprises H B Halli-9538793933
Kampli- Basha	5050505050	Ameena Enterprises Kampli-9743782887
usman T Gallu	6361701471	T. Gallu
HONNUR SWAMY	8123563136	AMARAVATHI VENKATESHWARA TEMPLE
Zaheer Abbas	8878654545	Hospet
Uma auto mobiles TVS	7899799999	collage Road
M Nagaraj	8888888888	Hospet Pepsi  distributor 968669662
sumanth 2	7892073432	nil
NAGARAJ	9999999999	
R K ENTERPRISES	8618215994	HOSPET
sumanth km 3	7892073431	hospet
Manjunath Narmada Caterings	8123133353	Bangalore
M Nagraj	9686169662	Local Distributor Peesi Nagaraj
Ajmat	8660172994	A J Enterprises 1947 signature
Chandru signature	7848042143	Hampi
Vallabha Enterprises	9538793933	H B Halli -patrappa
Manoj Kumar	8867186551	hospet 8073765859
Navazuddin	9731432666	KEB
B Mallikarjuna	9972598111	H B Halli Baligar Family-7353998922
shivartha Enterprises	9108270676	Koppala
SRI VEERABADRA AGENCY (GVT) Manjunath	9945866209	"6361102159
Raichur -Koppala Road Vijyanagar"
Anand Anjanadri	7259693267	Anjandri - coco kola
Raghava surya	9606282949	Anjandri
Bhima naik	9844505366	Rajeev nagara- Azimulla
C Paramesh	8861567984	Venkateshwara Temple
somashekar -swathi decorator	9448261804	hospet
counter sales	0	kempannavar industries
Rathna kumar	9731917923	T B Dam
Swathi Decorator	9742130982	Hospet
FAYAZ	8050452327	hOSPET
Navazudhin	9019372706	munirabad
Adil Computer	7892731886	Hospet
Prakash Caterings	9019480076	Hospet-
Hulugappa	9448261881	Hospet
Rajendra Prasad	9743246828	Hospet
counter sale	9686551876	office
Shivu Kumar	9482777787	Hospet
Venkateshwara Caterings	8296611131	Gangavathi
Bankanda Manjunath	9845899108	LIC Hospet
KARTHIK	7892498768	HOSPET
ISMAIL	9880876870	HOSPET
SAI CATERINGS	8073291172	HOSPET
RAFIQ	9845945433	HOSPET
HANUMANTHA 1947	8867303151	HOSPET LOCAL DIS
SHAKSHAVALLI -1947	9986469958	LOCAL DIS -AJMAT
VIRUPAKSHI KEMPS	9538609150	HOSPET LOCAL CAN DISTRIBUTOR`;

function parseData(raw) {
  const lines = [];
  let currentLine = '';
  let inQuotes = false;
  
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
    } else if (char === '\n' && !inQuotes) {
      lines.push(currentLine);
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  
  const records = [];
  const dataLines = lines.slice(1); // Skip header
  
  for (const line of dataLines) {
    if (!line.trim()) continue;
    let parts = line.split('\t');
    if (parts.length < 2) {
      parts = line.split(/  +/);
    }
    
    if (parts.length >= 2) {
      const name = parts[0].trim();
      const phone = parts[1].trim();
      let address = (parts[2] || '').trim();
      if (address.startsWith('"') && address.endsWith('"')) {
        address = address.slice(1, -1).trim();
      }
      records.push({ name, phone, address });
    }
  }
  return records;
}

function normalizePhone10(phone) {
  let s = String(phone || '').trim();
  const digits = s.replace(/\D+/g, '');
  if (digits === '0') {
    return '0000000000';
  }
  const ph = digits.length >= 10 ? digits.slice(-10) : digits;
  if (!/^\d{10}$/.test(ph)) {
    throw new Error(`Phone number ${phone} could not be normalized to 10 digits.`);
  }
  return ph;
}

function extractAlternatePhone(address) {
  let altPhone = null;
  let cleanAddress = address;

  // 1. Matches dash followed by 10 digits at the end of the address
  const matchEndDash = address.match(/-(\d{10})$/);
  if (matchEndDash) {
    altPhone = matchEndDash[1];
    cleanAddress = address.replace(/-(\d{10})$/, '').trim();
    return { altPhone, cleanAddress };
  }

  // 2. Matches space followed by 10 digits at the end
  const matchEndSpace = address.match(/\s+(\d{10})$/);
  if (matchEndSpace) {
    altPhone = matchEndSpace[1];
    cleanAddress = address.replace(/\s+(\d{10})$/, '').trim();
    return { altPhone, cleanAddress };
  }

  // 3. Matches 10 digits at the start, followed by newline or space
  const matchStart = address.match(/^"?(\d{10})\b/);
  if (matchStart) {
    altPhone = matchStart[1];
    cleanAddress = address.replace(/^"?\d{10}/, '').trim();
    cleanAddress = cleanAddress.replace(/^[\s\n\r"']+|[\s\n\r"']+$/g, '').trim();
    return { altPhone, cleanAddress };
  }

  // 4. Matches dash followed by 9 digits at the end
  const matchEndDash9 = address.match(/-(\d{9})$/);
  if (matchEndDash9) {
    altPhone = matchEndDash9[1];
    cleanAddress = address.replace(/-(\d{9})$/, '').trim();
    return { altPhone, cleanAddress };
  }

  // 5. Matches space followed by 9 digits at the end
  const matchEndSpace9 = address.match(/\s+(\d{9})$/);
  if (matchEndSpace9) {
    altPhone = matchEndSpace9[1];
    cleanAddress = address.replace(/\s+(\d{9})$/, '').trim();
    return { altPhone, cleanAddress };
  }

  return { altPhone, cleanAddress };
}

function detectCustomerType(name, address) {
  const combined = `${name} ${address}`.toLowerCase();
  if (
    combined.includes('distributor') ||
    combined.includes(' dist') ||
    combined.includes(' dis') ||
    combined.includes('agency') ||
    combined.includes('enterprises') ||
    combined.includes('comercial') ||
    combined.includes('commercial') ||
    combined.includes('supliery') ||
    combined.includes('supplier')
  ) {
    return 'Distributor';
  }
  return 'General Customer';
}

async function getNextIdSequence(tx, prefix, yyyy) {
  const [rows] = await tx.query(
    `SELECT id FROM customers WHERE id LIKE ? ORDER BY id DESC LIMIT 1`,
    [`${prefix}-${yyyy}-%`]
  );
  
  let seq = 1;
  if (rows.length) {
    const lastId = rows[0].id;
    const match = lastId.match(new RegExp(`^${prefix}-${yyyy}-(\\d+)$`));
    if (match && match[1]) {
      seq = parseInt(match[1]) + 1;
    }
  }
  return seq;
}

async function seed() {
  const connection = await pool.getConnection();
  try {
    console.log('Starting parsing and cleaning of customer data...');
    const rawRecords = parseData(rawData);
    console.log(`Parsed ${rawRecords.length} raw records.`);

    // Group by phone number
    const grouped = {};
    for (const rec of rawRecords) {
      let phone;
      try {
        phone = normalizePhone10(rec.phone);
      } catch (err) {
        console.error(`Skipping invalid phone record: ${JSON.stringify(rec)}. Error: ${err.message}`);
        continue;
      }

      if (!grouped[phone]) {
        grouped[phone] = [];
      }
      grouped[phone].push(rec);
    }

    console.log(`Grouped into ${Object.keys(grouped).length} unique phone number groups.`);

    const cleanedCustomers = [];
    for (const [phone, recs] of Object.entries(grouped)) {
      // Merge records in this group
      let finalName = '';
      let finalAddress = '';
      let finalAltPhone = null;
      let finalType = 'General Customer';

      // Gather names
      const names = [];
      // Gather addresses
      const addresses = [];

      for (const r of recs) {
        const trimmedName = r.name.replace(/\s+/g, ' ').trim();
        if (trimmedName && !names.includes(trimmedName)) {
          names.push(trimmedName);
        }

        const { altPhone, cleanAddress } = extractAlternatePhone(r.address);
        if (altPhone && !finalAltPhone) {
          finalAltPhone = altPhone;
        }

        const trimmedAddress = cleanAddress.replace(/\s+/g, ' ').trim();
        if (trimmedAddress && !addresses.includes(trimmedAddress)) {
          addresses.push(trimmedAddress);
        }

        const type = detectCustomerType(r.name, r.address);
        if (type === 'Distributor') {
          finalType = 'Distributor';
        }
      }

      // Merge names: if multiple different names, combine with ' / '
      if (names.length > 0) {
        // If one name is a substring of another, keep only the longer one to avoid redundancy
        // E.g. "Sudindra Catering" and "Sudhindra Catrings(H.k.Sudhindra )" -> can keep both or merge
        // Let's sort names by length and filter out names that are very similar or subset of others
        const uniqueNames = [];
        names.sort((a, b) => b.length - a.length);
        for (const n of names) {
          if (!uniqueNames.some(un => un.toLowerCase().includes(n.toLowerCase()))) {
            uniqueNames.push(n);
          }
        }
        finalName = uniqueNames.reverse().join(' / ');
      }

      // Merge addresses
      if (addresses.length > 0) {
        finalAddress = addresses.join(', ');
      }

      cleanedCustomers.push({
        name: finalName,
        phone,
        address: finalAddress,
        alternate_phone: finalAltPhone,
        customer_type: finalType
      });
    }

    console.log(`Cleaned and merged into ${cleanedCustomers.length} final customer profiles.`);

    // Start transaction
    await connection.beginTransaction();
    console.log('Database transaction started.');

    // Fetch existing customers to see if we have duplicates or need to upsert
    const [existing] = await connection.query('SELECT phone, id FROM customers');
    const existingMap = {};
    existing.forEach(row => {
      existingMap[row.phone] = row.id;
    });

    const now = new Date();
    const offset = now.getTimezoneOffset();
    const istDate = new Date(now.getTime() + (330 + offset) * 60000);
    const yyyy = istDate.getFullYear();

    let seq = await getNextIdSequence(connection, 'CUST', yyyy);
    console.log(`Initial ID sequence for prefix CUST-${yyyy}: ${seq}`);

    let insertCount = 0;
    let updateCount = 0;

    for (const cust of cleanedCustomers) {
      const existingId = existingMap[cust.phone];
      if (existingId) {
        // Update existing record
        await connection.query(
          `UPDATE customers 
           SET name = ?, address = ?, alternate_phone = ?, customer_type = ?, updated_at = NOW() 
           WHERE id = ?`,
          [cust.name, cust.address, cust.alternate_phone, cust.customer_type, existingId]
        );
        updateCount++;
      } else {
        // Insert new record
        const id = `CUST-${yyyy}-${String(seq).padStart(5, '0')}`;
        await connection.query(
          `INSERT INTO customers (id, name, phone, address, alternate_phone, customer_type, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [id, cust.name, cust.phone, cust.address, cust.alternate_phone, cust.customer_type]
        );
        seq++;
        insertCount++;
      }
    }

    await connection.commit();
    console.log('Database transaction committed successfully.');
    console.log(`Import finished! Total inserted: ${insertCount}, Total updated/merged: ${updateCount}`);

  } catch (err) {
    await connection.rollback();
    console.error('Transaction rolled back due to error:', err);
  } finally {
    connection.release();
    await pool.end();
  }
}

seed();
