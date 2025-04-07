const express = require('express');
const firebase = require('firebase-admin');
const path = require('path');
const axios = require('axios');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();

const serviceAccount = require('./key.json');
firebase.initializeApp({
    credential: firebase.credential.cert(serviceAccount)
});

const db = firebase.firestore();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'your-secret-key-here', 
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } 
}));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


app.get('/', (req, res) => {
    res.render('signin');
});

app.get('/signup', (req, res) => {
    res.render('signup');
});

app.post('/signup', async (req, res) => {
    const { email, password, name } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.collection('users').doc(email).set({
            email,
            password: hashedPassword,
            name,
            searches: []
        });
        res.redirect('/');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error signing up');
    }
});

app.post('/signin', async (req, res) => {
    const { email, password } = req.body;
    try {
        const userDoc = await db.collection('users').doc(email).get();
        if (userDoc.exists && await bcrypt.compare(password, userDoc.data().password)) {
            req.session.email = email;
            res.redirect('/dashboard');
        } else {
            res.status(401).send('Invalid credentials');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Error signing in');
    }
});

app.get('/dashboard', async (req, res) => {
    if (!req.session.email) return res.redirect('/');
    try {
        const userDoc = await db.collection('users').doc(req.session.email).get();
        res.render('dashboard', { user: userDoc.data(), page: 'profile' });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading dashboard');
    }
});

app.get('/search', async (req, res) => {
    if (!req.session.email) return res.redirect('/');
    try {
        const userDoc = await db.collection('users').doc(req.session.email).get();
        res.render('dashboard', { user: userDoc.data(), page: 'search' });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading search');
    }
});

app.post('/search', async (req, res) => {
    if (!req.session.email) return res.redirect('/');
    const { emailToSearch } = req.body;
    
    try {
        const response = await axios.get(`https://api.apilayer.com/email_verification/${encodeURIComponent(emailToSearch)}`, {
            headers: {
                'apikey': 'ffqe3v8VHNz4DIG5FVvPFg4AmgEVjXAU'
            }
        });
        
        console.log('API Response:', response.data); 

        const searchResult = {
            email: emailToSearch,
            status: response.data.mx_records ? 'valid' : 'invalid', 
            domain: response.data.domain || 'unknown',
            disposable: response.data.is_disposable || false,
            free: response.data.is_free_email || false,
            timestamp: new Date()
        };

        const userRef = db.collection('users').doc(req.session.email);
        await userRef.update({
            searches: firebase.firestore.FieldValue.arrayUnion(searchResult)
        });

        res.redirect('/dashboard');
    } catch (error) {
        console.error('Search Error:', error.message);
        if (error.response) {
            console.error('API Response Error:', error.response.data);
        }
        res.status(500).send('Error performing search: ' + error.message);
    }
});

app.get('/signout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

app.listen(3000, () => {
    console.log('Server running on port 3000');
});
