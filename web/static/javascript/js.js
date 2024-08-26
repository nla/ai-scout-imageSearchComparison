window.addEventListener("load", (event) => {
  console.log("loaded START") ;

  for (let ele of document.getElementsByClassName("eb")) {

    ele.addEventListener('click', function (e) {
   
      e.preventDefault() ;
      console.log("got eb click " + e.target.id) ;
      let val = e.target.id ;
      if (val.length > 2) val = val.substring(0, 2) ; // strip of x from bottom buttons
      console.log("val /" + val + "/") ;

      document.getElementById("eval").value = val ;
      
      document.getElementById("evalForm").submit() ;  
    }) ;  
    ele.style.visibility = "visible" ;  // it was not visible until event set up..
  }

  
  console.log("loaded DONE") ;
}) ;