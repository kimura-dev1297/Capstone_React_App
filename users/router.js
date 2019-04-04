'use strict';
const express = require('express');
const bodyParser = require('body-parser');
const {User} = require('./models');
const router = express.Router();
const jsonParser = bodyParser.json();
const bcrypt = require('bcryptjs');
const {createAuthToken} = require('../auth/router');
const passport = require('passport');
const jwtAuth = passport.authenticate('jwt', {session: false});

// Post to register a new user
router.post('/', jsonParser, (req, res) => {
  const requiredFields = ['username','email', 'password'];
  const missingField = requiredFields.find(field => !(field in req.body));

  if (missingField) {
    return res.status(422).json({
      code: 422,
      reason: 'ValidationError',
      message: 'Missing field',
      location: missingField
    });
    console.log(res.message);
  }

  const stringFields = ['username', 'password', 'firstName', 'lastName','email'];
  const nonStringField = stringFields.find(
    field => field in req.body && typeof req.body[field] !== 'string'
  );

  if (nonStringField) {
    return res.status(422).json({
      code: 422,
      reason: 'ValidationError',
      message: 'Incorrect field type: expected string',
      location: nonStringField
    });
  }

  const explicityTrimmedFields = ['username', 'password'];
  const nonTrimmedField = explicityTrimmedFields.find(
    field => req.body[field].trim() !== req.body[field]
  );

  if (nonTrimmedField) {
    return res.status(422).json({
      code: 422,
      reason: 'ValidationError',
      message: 'Cannot start or end with whitespace',
      location: nonTrimmedField
    });
  }

  const sizedFields = {
    username: {
      min: 1
    },
    password: {
      min: 6,
      // bcrypt truncates after 72 characters, so let's not give the illusion
      // of security by storing extra (unused) info
      max: 72
    }
  };
  const tooSmallField = Object.keys(sizedFields).find(
    field =>
      'min' in sizedFields[field] &&
            req.body[field].trim().length < sizedFields[field].min
  );
  const tooLargeField = Object.keys(sizedFields).find(
    field =>
      'max' in sizedFields[field] &&
            req.body[field].trim().length > sizedFields[field].max
  );

  if (tooSmallField || tooLargeField) {
    return res.status(422).json({
      code: 422,
      reason: 'ValidationError',
      message: tooSmallField
        ? `Must be at least ${sizedFields[tooSmallField]
          .min} characters long`
        : `Must be at most ${sizedFields[tooLargeField]
          .max} characters long`,
      location: tooSmallField || tooLargeField
    });
  }

  let {username, email, password, firstName = '', lastName = ''} = req.body;
  // Username and password come in pre-trimmed, otherwise we throw an error
  // before this
  firstName = firstName.trim();
  lastName = lastName.trim();

  return User.find({'username': username, 'email': email})
    .count()
    .then(count => {
      if (count > 0) {
        // There is an existing user with the same username
        return Promise.reject({
          code: 422,
          reason: 'ValidationError',
          message: 'Username already taken',
          location: 'username'
        });
        
      }
      // If there is no existing user, hash the password
      return User.hashPassword(password);
    })
    .then(hash => {

      return User.create({
        username,
        password: hash,
        email,
        firstName,
        lastName
      });
    })
    .then(user => {
      const authToken = createAuthToken(user.serialize());
      let userOutput = user.serialize();
      userOutput.authToken = authToken;
      // return res.status(201).json(user.serialize());
      
      return res.status(201).json(userOutput);
    })
    .catch(err => {
      // Forward validation errors on to the client, otherwise give a 500
      // error because something unexpected has happened
      if (err.reason === 'ValidationError') {
        return res.status(err.code).json(err);
      }
      res.status(500).json({code: 500, message: 'Internal server error'});
      console.log(err);
    });
});


// @route     GET api/users/:username
// @desc      GET a single user by username
// @access    Public
// Working
router.get('/:username', jwtAuth, (req, res) => {
  User.findOne({username: req.params.username})
    // .populate('courses','user','username firstName lastName')
    .then(user => {
      res.status(200).json(user.serialize());
    }).catch(err => {
      console.error(err);
      res.status(500).json({message:'Internal server error'});
    });
})

// @route     GET api/users/:username
// @desc      GET 
// @access    Public
router.get('/:username/courses', (req, res) => {
  User.findOne({username: req.params.username})
    .populate('courses')
    .then(user => {
      res.status(200).json(user.courses.map(course => course.serialize()));
    }).catch(err => {
      console.error(err);
      res.status(500).json({message:'Internal server error'});
    });
})

module.exports = {router};
