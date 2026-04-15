const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));           // serves all HTML/CSS/JS
app.use(express.urlencoded({ extended: true })); // for form data

// Load all routes from routes/ folder
const mainRoutes = require('./routes/index');
app.use('/', mainRoutes);

app.listen(PORT, () => {
  console.log(`✅ Hamshchos running on port ${PORT}`);
});
